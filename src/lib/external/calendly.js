/**
 * Calendly API client — brief §5 (1099 rep booking flow).
 *
 * Docs: https://developer.calendly.com/api-docs
 *
 * Auth: personal access token (CALENDLY_API_KEY) held server-side;
 * browser → `${API_BASE}/proxy/calendly/*`.
 *
 * Endpoints used:
 *   GET  /users/me
 *   GET  /event_types?user=<uri>
 *   GET  /scheduled_events?user=<uri>&status=active
 *   POST /scheduling_links                  (single-use booking links)
 *
 * Webhook (invitee.created / invitee.canceled) arrives at
 * /api/hooks/calendly and is dispatched to `handleWebhookEvent` below
 * by the SPA's webhook bridge: it logs a CRM activity and syncs the
 * booker into HubSpot — the brief's "rep books a call → manager sees
 * all rep activity" loop.
 */

import { db } from '../db.js';
import { uid, delay } from '../format.js';
import { API_BASE, fetchJson, realOrStub, warn } from './_http.js';
import { hubspot } from './hubspot.js';

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callCalendly({ method = 'GET', path, body }) {
  return fetchJson(`${API_BASE}/proxy/calendly${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const STUB_EVENT_TYPES = [
  { uri: 'stub/intro-15', name: 'Intro call · 15 min', duration: 15, scheduling_url: 'https://calendly.com/unitemedical/intro' },
  { uri: 'stub/demo-30', name: 'Product walkthrough · 30 min', duration: 30, scheduling_url: 'https://calendly.com/unitemedical/demo' },
  { uri: 'stub/qbr-45', name: 'Quarterly business review · 45 min', duration: 45, scheduling_url: 'https://calendly.com/unitemedical/qbr' },
];

export const calendly = {
  /** The authenticated Calendly user (org owner). */
  async me() {
    return realOrStub({
      scope: 'calendly',
      label: 'me',
      predicate: () => viaBackendProxy(),
      real: async () => (await callCalendly({ path: '/users/me' })).resource,
      stub: async () => {
        await delay(120, 240);
        return { uri: 'stub/users/unite', name: 'Unite Medical', scheduling_url: 'https://calendly.com/unitemedical', stub: true };
      },
    });
  },

  /** Event types (meeting templates) available for booking. */
  async listEventTypes() {
    return realOrStub({
      scope: 'calendly',
      label: 'listEventTypes',
      predicate: () => viaBackendProxy(),
      real: async () => {
        const me = await callCalendly({ path: '/users/me' });
        const resp = await callCalendly({ path: `/event_types?user=${encodeURIComponent(me.resource.uri)}&active=true` });
        return resp.collection || [];
      },
      stub: async () => {
        await delay(140, 280);
        return STUB_EVENT_TYPES;
      },
    });
  },

  /** Upcoming scheduled events across the rep network. */
  async listScheduledEvents({ count = 20 } = {}) {
    return realOrStub({
      scope: 'calendly',
      label: 'listScheduledEvents',
      predicate: () => viaBackendProxy(),
      real: async () => {
        const me = await callCalendly({ path: '/users/me' });
        const resp = await callCalendly({
          path: `/scheduled_events?user=${encodeURIComponent(me.resource.uri)}&status=active&sort=start_time:asc&count=${count}`,
        });
        return resp.collection || [];
      },
      stub: async () => {
        await delay(140, 280);
        return db.list('calendar_events', { orderBy: 'start_at', limit: count })
          .map((e) => ({ uri: e.id, name: e.summary, start_time: e.start_at, end_time: e.end_at, stub: true }));
      },
    });
  },

  /** Single-use booking link for a quote follow-up or rep intro. */
  async createSchedulingLink({ event_type_uri, max_event_count = 1 }) {
    return realOrStub({
      scope: 'calendly',
      label: 'createSchedulingLink',
      predicate: () => viaBackendProxy(),
      real: async () => {
        const resp = await callCalendly({
          method: 'POST',
          path: '/scheduling_links',
          body: { max_event_count, owner: event_type_uri, owner_type: 'EventType' },
        });
        return resp.resource;
      },
      stub: async () => {
        await delay(120, 260);
        return { booking_url: `https://calendly.com/d/stub-${uid().slice(3)}`, owner: event_type_uri, stub: true };
      },
    });
  },

  /**
   * Webhook dispatcher — invitee.created / invitee.canceled.
   * Logs CRM activity, mirrors the meeting locally, and syncs the
   * booker into HubSpot.
   */
  async handleWebhookEvent(event) {
    const type = event?.event;
    const payload = event?.payload || {};
    if (!type) return { ok: false, reason: 'no_event_type' };

    if (type === 'invitee.created') {
      const invitee = payload;
      const scheduled = payload.scheduled_event || {};
      db.insert('calendar_events', {
        id: uid('cal'),
        google_event_id: null,
        calendly_event_uri: scheduled.uri || null,
        summary: scheduled.name || 'Calendly booking',
        description: `Booked by ${invitee.name || invitee.email}`,
        start_at: scheduled.start_time,
        end_at: scheduled.end_time,
        attendees: [invitee.email].filter(Boolean),
        rep_email: scheduled.event_memberships?.[0]?.user_email || null,
        source: 'calendly',
      });
      db.insert('activities', {
        id: uid('act'),
        kind: 'meeting',
        source: 'calendly',
        who: scheduled.event_memberships?.[0]?.user_email || 'rep',
        subject: `Booked · ${scheduled.name || 'meeting'}`,
        body: `${invitee.name || invitee.email} booked via Calendly`,
        created_at: new Date().toISOString(),
      });
      try {
        if (invitee.email) {
          await hubspot.upsertContact({
            email: invitee.email,
            firstname: (invitee.name || '').split(' ')[0],
            lastname: (invitee.name || '').split(' ').slice(1).join(' '),
            lifecyclestage: 'opportunity',
          });
        }
      } catch (err) {
        warn('calendly', `HubSpot sync failed for ${invitee.email}: ${err.message}`);
      }
      return { ok: true, kind: type };
    }

    if (type === 'invitee.canceled') {
      const scheduled = payload.scheduled_event || {};
      const mirror = db.list('calendar_events', { where: { calendly_event_uri: scheduled.uri } })[0];
      if (mirror) db.update('calendar_events', mirror.id, { canceled: true });
      return { ok: true, kind: type, mirrored: Boolean(mirror) };
    }

    return { ok: true, kind: type, ignored: true };
  },

  __isConfigured: () => viaBackendProxy(),
};
