import crypto from 'node:crypto';

function number(value) { return Number(value) || 0; }
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function activeAgreement(agreements, candidate) {
  const at = new Date(candidate.eligible_at || Date.now()).getTime();
  return agreements.find((row) => row.owner_org_id === candidate.owner_org_id
    && row.unite_sellable === true
    && ((candidate.distributor_sku && row.distributor_sku === candidate.distributor_sku)
      || row.mapped_unite_sku === candidate.product_sku)
    && number(row.settlement_unit_cost) > 0
    && (!row.settlement_effective_from || new Date(row.settlement_effective_from).getTime() <= at)
    && (!row.settlement_effective_until || new Date(row.settlement_effective_until).getTime() > at)) || null;
}

export function buildSettlementDrafts({ candidates = [], agreements = [], organizations = [] } = {}) {
  if (!candidates.length) return { ok: true, purchase_orders: [], movements: [], candidates: [] };
  const enriched = [];
  for (const candidate of candidates) {
    const agreement = activeAgreement(agreements, candidate);
    if (!agreement) {
      return {
        ok: false, reason: 'active_settlement_price_required',
        owner_org_id: candidate.owner_org_id, product_sku: candidate.product_sku,
      };
    }
    enriched.push({ candidate, agreement });
  }
  const groups = new Map();
  for (const row of enriched) {
    const currency = row.agreement.settlement_currency || 'USD';
    const key = `${row.candidate.owner_org_id}:${currency}`;
    const group = groups.get(key) || { owner_org_id: row.candidate.owner_org_id, currency, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const purchaseOrders = [];
  const movements = [];
  const batchedCandidates = [];
  for (const group of groups.values()) {
    const movementIds = group.rows.map((row) => row.candidate.movement_id).sort();
    const poId = stableId('SPO', `${group.owner_org_id}:${group.currency}:${movementIds.join(',')}`);
    const owner = organizations.find((row) => row.id === group.owner_org_id);
    const lineMap = new Map();
    for (const { candidate, agreement } of group.rows) {
      const key = agreement.id;
      const current = lineMap.get(key) || {
        sku: agreement.distributor_sku || candidate.distributor_sku || candidate.product_sku,
        name: agreement.name || agreement.product_name || agreement.distributor_sku || candidate.product_sku,
        qty: 0,
        cost: number(agreement.settlement_unit_cost),
        agreement_id: agreement.id,
        agreement_effective_from: agreement.settlement_effective_from || null,
        agreement_effective_until: agreement.settlement_effective_until || null,
      };
      current.qty += number(candidate.qty);
      lineMap.set(key, current);
      movements.push({
        id: candidate.movement_id,
        settlement_po_id: poId,
        unit_cost: number(agreement.settlement_unit_cost),
        agreement_id: agreement.id,
        settlement_currency: group.currency,
      });
      batchedCandidates.push({
        ...candidate,
        status: 'batched',
        settlement_po_id: poId,
        agreement_id: agreement.id,
        agreed_unit_cost: number(agreement.settlement_unit_cost),
        settlement_currency: group.currency,
      });
    }
    const lineItems = [...lineMap.values()].sort((a, b) => a.sku.localeCompare(b.sku));
    const createdAt = group.rows.map((row) => row.candidate.eligible_at).filter(Boolean).sort().at(-1) || new Date().toISOString();
    purchaseOrders.push({
      id: poId,
      po_type: 'consignment_settlement',
      owner_org_id: group.owner_org_id,
      vendor_id: group.owner_org_id,
      vendor_qbo_id: owner?.qbo_vendor_id || owner?.qbo_id || null,
      vendor_name: owner?.name || group.owner_org_id,
      vendor_email: owner?.contact_email || null,
      status: 'draft',
      currency: group.currency,
      settlement_currency: group.currency,
      line_items: lineItems,
      eligible_movement_ids: movementIds,
      total_cost: +lineItems.reduce((sum, line) => sum + line.qty * line.cost, 0).toFixed(2),
      created_by: 'consignment-handoff',
      created_at: createdAt,
    });
  }
  return {
    ok: true,
    purchase_orders: purchaseOrders.sort((a, b) => a.id.localeCompare(b.id)),
    movements,
    candidates: batchedCandidates,
  };
}
