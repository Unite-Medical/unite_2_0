/**
 * HubSpot CRM v3 client — PRD-06.
 *
 * Docs:
 *   https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/guide
 *   https://developers.hubspot.com/docs/api-reference/legacy/crm/properties/guide
 *
 * Auth: private app token (Bearer). Each Unite-tenant production
 * install gets its own private app + token.
 *
 * Endpoints used here:
 *   POST /crm/v3/objects/contacts
 *   POST /crm/v3/objects/contacts/batch/create
 *   POST /crm/v3/objects/companies
 *   POST /crm/v3/objects/deals
 *   POST /crm/v3/objects/tasks
 *   GET  /crm/v3/objects/contacts/{id}
 *   POST /crm/v3/properties/contacts            (one-time setup)
 *
 * Custom properties created on first run (PRD-06 §4):
 *   - companies: unite_segment, unite_tier, unite_terms, unite_credit_limit,
 *                unite_total_spend_ytd, unite_account_rep, unite_last_order_at,
 *                unite_dea_number, unite_tax_exempt_status
 *   - contacts:  unite_role, unite_decision_authority, unite_last_call_at,
 *                unite_last_call_summary
 *   - deals:     unite_order_id, unite_quote_id, unite_segment
 */

import { db } from '../db.js';
import { delay, uid } from '../format.js';
import { API_BASE, env, fetchJson, realOrStub } from './_http.js';

const HUBSPOT_BASE = 'https://api.hubapi.com';

function isConfigured() {
  return Boolean(env('HUBSPOT_PRIVATE_APP_TOKEN'));
}

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callHubSpot({ method = 'GET', path, body }) {
  if (viaBackendProxy()) {
    return fetchJson(`${API_BASE}/proxy/hubspot${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  return fetchJson(`${HUBSPOT_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env('HUBSPOT_PRIVATE_APP_TOKEN')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// All values in HubSpot's properties object must be strings.
function stringify(properties) {
  const out = {};
  for (const [k, v] of Object.entries(properties || {})) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

// Properties fetched on reads (GET list accepts a comma-separated set).
const CONTACT_PROPS = [
  'email', 'firstname', 'lastname', 'phone', 'company', 'jobtitle',
  'lifecyclestage', 'hs_lead_status', 'createdate', 'lastmodifieddate',
  'unite_role', 'unite_decision_authority', 'unite_last_call_at', 'unite_last_call_summary',
];
const COMPANY_PROPS = [
  'name', 'domain', 'industry', 'city', 'state', 'country', 'phone',
  'numberofemployees', 'lifecyclestage', 'createdate',
  'unite_segment', 'unite_tier', 'unite_terms', 'unite_credit_limit',
  'unite_total_spend_ytd', 'unite_account_rep', 'unite_last_order_at',
  'unite_dea_number', 'unite_tax_exempt_status',
];
const DEAL_PROPS = [
  'dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'createdate',
  'hs_lastmodifieddate', 'hs_is_closed', 'hs_is_closed_won',
  'unite_order_id', 'unite_quote_id', 'unite_segment',
];

const MIRROR_TABLE = { contacts: 'hubspot_contacts', companies: 'hubspot_companies', deals: 'hubspot_deals' };

// GET a page of objects with selected properties. Pagination via `after`.
async function listObjects(objectType, properties, { limit = 100, after } = {}) {
  const qs = new URLSearchParams({ limit: String(limit), properties: properties.join(','), archived: 'false' });
  if (after) qs.set('after', after);
  return callHubSpot({ method: 'GET', path: `/crm/v3/objects/${objectType}?${qs.toString()}` });
}

export const hubspot = {
  /** Create or update a contact by email. */
  async upsertContact({ email, firstname, lastname, company, phone, lifecyclestage = 'lead', unite_role, unite_decision_authority }) {
    if (!email) throw new Error('hubspot.upsertContact requires email');
    const properties = stringify({
      email, firstname, lastname, company, phone, lifecyclestage,
      unite_role,
      unite_decision_authority,
    });
    return realOrStub({
      scope: 'hubspot',
      label: `upsertContact(${email})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        // Try create; if 409 (already exists) → search + update.
        try {
          const data = await callHubSpot({ method: 'POST', path: '/crm/v3/objects/contacts', body: { properties } });
          db.upsert('hubspot_contacts', { id: data.id, properties: data.properties, last_synced_at: new Date().toISOString() });
          return { id: data.id, created: true };
        } catch (err) {
          if (err.status !== 409) throw err;
          const search = await callHubSpot({
            method: 'POST',
            path: '/crm/v3/objects/contacts/search',
            body: { filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }], limit: 1 },
          });
          const existing = search?.results?.[0];
          if (!existing) throw err;
          const updated = await callHubSpot({ method: 'PATCH', path: `/crm/v3/objects/contacts/${existing.id}`, body: { properties } });
          db.upsert('hubspot_contacts', { id: updated.id, properties: updated.properties, last_synced_at: new Date().toISOString() });
          return { id: updated.id, created: false };
        }
      },
      stub: async () => {
        await delay(160, 340);
        const id = `hs_${uid().slice(3)}`;
        const row = db.insert('hubspot_contacts', { id, properties: { ...properties, createdate: new Date().toISOString() }, last_synced_at: new Date().toISOString() });
        return { id: row.id, created: true, stub: true };
      },
    });
  },

  /** Create a deal linked to an existing contact + company. */
  async createDeal({ dealname, amount, stage = 'qualifiedtobuy', pipeline = 'default', contact_id, company_id, unite_order_id, unite_quote_id, unite_segment, close_date }) {
    const properties = stringify({
      dealname,
      amount,
      dealstage: stage,
      closedate: close_date,
      pipeline,
      unite_order_id,
      unite_quote_id,
      unite_segment,
    });
    const associations = [];
    if (contact_id) associations.push({ to: { id: contact_id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] });
    if (company_id) associations.push({ to: { id: company_id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }] });

    return realOrStub({
      scope: 'hubspot',
      label: `createDeal(${dealname})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const data = await callHubSpot({ method: 'POST', path: '/crm/v3/objects/deals', body: { properties, associations } });
        return { id: data.id };
      },
      stub: async () => {
        await delay(150, 320);
        return { id: `hs_deal_${uid().slice(3)}`, stub: true };
      },
    });
  },

  /** Create a task assigned to a HubSpot owner. */
  async createTask({ subject, body, due_iso, owner_email, contact_id, deal_id }) {
    const properties = stringify({
      hs_task_subject: subject,
      hs_task_body: body,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'MEDIUM',
      hs_timestamp: due_iso ? new Date(due_iso).getTime() : Date.now(),
      hubspot_owner_id: owner_email,
    });
    const associations = [];
    if (contact_id) associations.push({ to: { id: contact_id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }] });
    if (deal_id) associations.push({ to: { id: deal_id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }] });

    return realOrStub({
      scope: 'hubspot',
      label: `createTask(${subject})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const data = await callHubSpot({ method: 'POST', path: '/crm/v3/objects/tasks', body: { properties, associations } });
        return { id: data.id };
      },
      stub: async () => {
        await delay(140, 300);
        const id = uid('task');
        db.insert('tasks', { id, title: subject, notes: body, due_date: due_iso?.slice(0, 10), status: 'open', source: 'hubspot', hubspot_task_id: id });
        return { id, stub: true };
      },
    });
  },

  /**
   * Compatibility alias — several call sites (Register, Contact)
   * predate the upsert naming. Same semantics: create, or update on
   * email collision.
   */
  async createContact(args) {
    return this.upsertContact(args);
  },

  /**
   * One-time setup: ensure all Unite custom properties exist on HubSpot.
   * Idempotent — 409s on existing properties are ignored.
   */
  async ensureCustomProperties() {
    const propertyGroups = {
      companies: [
        { name: 'unite_segment', label: 'Unite Segment', type: 'enumeration', fieldType: 'select', options: [
          { label: 'ASC', value: 'asc' }, { label: 'Pharmacy', value: 'pharmacy' }, { label: 'EMS', value: 'ems' }, { label: 'Government', value: 'gov' }, { label: 'Distributor', value: 'distributors' }, { label: 'Retail', value: 'retail' },
        ] },
        { name: 'unite_tier', label: 'Unite Tier', type: 'enumeration', fieldType: 'select', options: [
          { label: 'A', value: 'A' }, { label: 'B', value: 'B' }, { label: 'C', value: 'C' }, { label: 'Distributor', value: 'distributor' },
        ] },
        { name: 'unite_terms', label: 'Unite Payment Terms', type: 'enumeration', fieldType: 'select', options: [
          { label: 'Card', value: 'card' }, { label: 'ACH', value: 'ach' }, { label: 'Net-30', value: 'net30' }, { label: 'Net-60', value: 'net60' }, { label: 'Wire', value: 'wire' }, { label: 'EDI', value: 'edi' },
        ] },
        { name: 'unite_credit_limit', label: 'Unite Credit Limit', type: 'number', fieldType: 'number' },
        { name: 'unite_total_spend_ytd', label: 'Unite YTD Spend', type: 'number', fieldType: 'number' },
        { name: 'unite_account_rep', label: 'Unite Account Rep', type: 'string', fieldType: 'text' },
        { name: 'unite_last_order_at', label: 'Unite Last Order', type: 'datetime', fieldType: 'date' },
        { name: 'unite_dea_number', label: 'DEA Number', type: 'string', fieldType: 'text' },
        { name: 'unite_tax_exempt_status', label: 'Tax Exempt Status', type: 'enumeration', fieldType: 'select', options: [
          { label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Pending', value: 'pending' },
        ] },
      ],
      contacts: [
        { name: 'unite_role', label: 'Unite Role', type: 'enumeration', fieldType: 'select', options: [
          { label: 'Buyer', value: 'buyer' }, { label: 'Operations', value: 'ops' }, { label: 'Clinician', value: 'clinician' }, { label: 'Finance', value: 'finance' }, { label: 'Exec', value: 'exec' },
        ] },
        { name: 'unite_decision_authority', label: 'Decision Authority', type: 'enumeration', fieldType: 'select', options: [
          { label: 'Economic', value: 'economic' }, { label: 'Technical', value: 'technical' }, { label: 'User', value: 'user' }, { label: 'Gatekeeper', value: 'gatekeeper' },
        ] },
        { name: 'unite_last_call_at', label: 'Last Call', type: 'datetime', fieldType: 'date' },
        { name: 'unite_last_call_summary', label: 'Last Call Summary', type: 'string', fieldType: 'textarea' },
      ],
      deals: [
        { name: 'unite_order_id', label: 'Unite Order ID', type: 'string', fieldType: 'text', hasUniqueValue: true },
        { name: 'unite_quote_id', label: 'Unite Quote ID', type: 'string', fieldType: 'text' },
        { name: 'unite_segment', label: 'Unite Segment', type: 'enumeration', fieldType: 'select', options: [
          { label: 'ASC', value: 'asc' }, { label: 'Pharmacy', value: 'pharmacy' }, { label: 'EMS', value: 'ems' }, { label: 'Government', value: 'gov' }, { label: 'Distributor', value: 'distributors' }, { label: 'Retail', value: 'retail' },
        ] },
      ],
    };

    return realOrStub({
      scope: 'hubspot',
      label: 'ensureCustomProperties',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const results = {};
        for (const [objectType, props] of Object.entries(propertyGroups)) {
          results[objectType] = [];
          // Ensure a dedicated "unite" property group exists for this object
          // type first (default HubSpot groups vary by portal). Idempotent.
          try {
            await callHubSpot({ method: 'POST', path: `/crm/v3/properties/${objectType}/groups`, body: { name: 'unite', label: 'Unite' } });
          } catch (err) {
            if (err.status !== 409) results[objectType].push({ name: '__group__', status: 'error', error: err.message });
          }
          for (const p of props) {
            try {
              await callHubSpot({ method: 'POST', path: `/crm/v3/properties/${objectType}`, body: { groupName: 'unite', ...p } });
              results[objectType].push({ name: p.name, status: 'created' });
            } catch (err) {
              if (err.status === 409) {
                results[objectType].push({ name: p.name, status: 'exists' });
              } else {
                results[objectType].push({ name: p.name, status: 'error', error: err.message });
              }
            }
          }
        }
        return results;
      },
      stub: async () => {
        await delay(200, 400);
        const results = {};
        for (const [objectType, props] of Object.entries(propertyGroups)) {
          results[objectType] = props.map((p) => ({ name: p.name, status: 'stub' }));
        }
        return results;
      },
    });
  },

  /**
   * Read a page of CRM objects (contacts | companies | deals) and mirror
   * them into the local DB for reactive admin views. Returns
   * `{ results, after }` where `after` is the next pagination cursor (or
   * null). Stub mode returns whatever's already mirrored locally.
   */
  async list(objectType, opts = {}) {
    const props = objectType === 'contacts' ? CONTACT_PROPS : objectType === 'companies' ? COMPANY_PROPS : DEAL_PROPS;
    const table = MIRROR_TABLE[objectType];
    if (!table) throw new Error(`hubspot.list: unsupported object "${objectType}"`);
    return realOrStub({
      scope: 'hubspot',
      label: `list(${objectType})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const data = await listObjects(objectType, props, opts);
        const now = new Date().toISOString();
        for (const r of data.results || []) {
          db.upsert(table, { id: r.id, properties: r.properties || {}, hs_created_at: r.createdAt, hs_updated_at: r.updatedAt, last_synced_at: now });
        }
        return { results: data.results || [], after: data.paging?.next?.after || null };
      },
      stub: async () => {
        await delay(120, 260);
        return { results: db.list(table), after: null, stub: true };
      },
    });
  },

  /** Convenience wrappers. */
  async listContacts(opts) { return this.list('contacts', opts); },
  async listCompanies(opts) { return this.list('companies', opts); },
  async listDeals(opts) { return this.list('deals', opts); },

  /**
   * Pull every page of an object type (bounded) and return the full set.
   * Used by the admin "Sync now" action.
   */
  async syncAll(objectType, { maxPages = 20, limit = 100 } = {}) {
    let after;
    let pages = 0;
    let total = 0;
    do {
      const { results, after: next } = await this.list(objectType, { limit, after });
      total += results.length;
      after = next;
      pages += 1;
    } while (after && pages < maxPages);
    return { objectType, total, pages };
  },

  /** Deal pipelines + stage label map (for rendering stage names). */
  async pipelines() {
    return realOrStub({
      scope: 'hubspot',
      label: 'pipelines',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const data = await callHubSpot({ method: 'GET', path: '/crm/v3/pipelines/deals' });
        return data.results || [];
      },
      stub: async () => { await delay(80, 160); return []; },
    });
  },

  /** Per-object totals via the search endpoint (returns `total`). */
  async totals() {
    return realOrStub({
      scope: 'hubspot',
      label: 'totals',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const out = {};
        for (const objectType of ['contacts', 'companies', 'deals']) {
          try {
            const data = await callHubSpot({ method: 'POST', path: `/crm/v3/objects/${objectType}/search`, body: { limit: 1 } });
            out[objectType] = data.total ?? 0;
          } catch {
            out[objectType] = null;
          }
        }
        return out;
      },
      stub: async () => {
        await delay(100, 200);
        return {
          contacts: db.count('hubspot_contacts'),
          companies: db.count('hubspot_companies'),
          deals: db.count('hubspot_deals'),
        };
      },
    });
  },

  __isConfigured: isConfigured,
};
