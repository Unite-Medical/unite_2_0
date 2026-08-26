export function aggregateVendorBillLines(vendorBillLines = []) {
  const grouped = new Map();
  for (const raw of vendorBillLines || []) {
    const sku = String(raw?.sku || '').trim();
    if (!sku) continue;
    const qty = Math.max(0, Number(raw.qty || 0));
    const unitCost = Math.max(0, Number(raw.unit_cost || 0));
    const current = grouped.get(sku) || { sku, qty: 0, extended_cost: 0 };
    current.qty += qty;
    current.extended_cost += qty * unitCost;
    grouped.set(sku, current);
  }
  return [...grouped.values()].map((line) => ({
    sku: line.sku,
    qty: line.qty,
    unit_cost: line.qty > 0 ? +(line.extended_cost / line.qty).toFixed(6) : 0,
  }));
}

export function matchVendorBill(po, { vendor_bill_lines = [], settlement_movements = [] } = {}) {
  if (!po) return { ok: false, reason: 'po_not_found' };
  const invalidLineIndex = (vendor_bill_lines || []).findIndex((line) => {
    const sku = String(line?.sku || '').trim();
    const qty = Number(line?.qty);
    const unitCost = Number(line?.unit_cost);
    return !sku || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitCost) || unitCost < 0;
  });
  if (invalidLineIndex >= 0) return { ok: false, reason: 'invalid_vendor_bill_line', line_index: invalidLineIndex };
  const settlement = po.po_type === 'consignment_settlement';
  const expectedEvidenceIds = settlement ? [...new Set(po.eligible_movement_ids || [])].sort() : [];
  const eligibleEvidence = settlement_movements
    .filter((movement) => expectedEvidenceIds.includes(movement.id)
      && movement.settlement_po_id === po.id && movement.settled !== true);
  if (settlement && (!expectedEvidenceIds.length
      || eligibleEvidence.length !== expectedEvidenceIds.length)) {
    return { ok: false, reason: 'eligible_settlement_evidence_required' };
  }
  const poLines = po.line_items || [];
  const aggregatedBillLines = aggregateVendorBillLines(vendor_bill_lines);
  const poSkus = new Set(poLines.map((line) => line.sku));
  const unexpectedLines = aggregatedBillLines
    .filter((line) => !poSkus.has(line.sku))
    .map((line) => ({
      sku: line.sku,
      qty: Math.max(0, Number(line.qty || 0)),
      unit_cost: Math.max(0, Number(line.unit_cost || 0)),
      held_amount: +(Math.max(0, Number(line.qty || 0)) * Math.max(0, Number(line.unit_cost || 0))).toFixed(2),
      reason: 'sku_not_on_po',
    }));
  const lines = [...poSkus].map((sku) => {
    const sourceLines = poLines.filter((line) => line.sku === sku);
    const bill = aggregatedBillLines.find((line) => line.sku === sku) || {};
    const ordered = sourceLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
    const accepted = sourceLines.reduce((sum, line) => sum + (settlement ? Number(line.qty || 0) : Number(line.accepted_qty ?? line.received_qty ?? 0)), 0);
    const previouslyBilled = sourceLines.reduce((sum, line) => sum + Number(line.billed_qty || 0), 0);
    const billable = Math.max(0, accepted - previouslyBilled);
    const vendorBilledQty = Math.max(0, Number(bill.qty || 0));
    const vendorUnitCost = Math.max(0, Number(bill.unit_cost || 0));
    let remainingVendorQty = Math.min(vendorBilledQty, billable);
    let approvedQty = 0;
    let approvedAmount = 0;
    let priceVarianceAmount = 0;
    for (const source of sourceLines) {
      if (remainingVendorQty <= 0) break;
      const sourceAccepted = settlement ? Number(source.qty || 0) : Number(source.accepted_qty ?? source.received_qty ?? 0);
      const sourceBillable = Math.max(0, sourceAccepted - Number(source.billed_qty || 0));
      const allocated = Math.min(sourceBillable, remainingVendorQty);
      const sourceCost = Math.max(0, Number(source.cost || 0));
      approvedQty += allocated;
      approvedAmount += allocated * Math.min(sourceCost, vendorUnitCost);
      priceVarianceAmount += allocated * Math.max(0, vendorUnitCost - sourceCost);
      remainingVendorQty -= allocated;
    }
    const quantityVarianceAmount = Math.max(0, vendorBilledQty - approvedQty) * vendorUnitCost;
    const weightedPoCost = ordered > 0
      ? sourceLines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.cost || 0), 0) / ordered
      : 0;
    return {
      sku,
      ordered_qty: ordered,
      accepted_qty: accepted,
      previously_billed_qty: previouslyBilled,
      billable_qty: billable,
      vendor_billed_qty: vendorBilledQty,
      approved_qty: approvedQty,
      vendor_backorder_qty: settlement ? 0 : Math.max(0, ordered - accepted),
      po_unit_cost: +weightedPoCost.toFixed(6),
      vendor_unit_cost: vendorUnitCost,
      approved_unit_cost: approvedQty > 0 ? +(approvedAmount / approvedQty).toFixed(6) : 0,
      approved_amount: +approvedAmount.toFixed(2),
      price_variance_amount: +priceVarianceAmount.toFixed(2),
      quantity_variance_amount: +quantityVarianceAmount.toFixed(2),
      held_amount: +(priceVarianceAmount + quantityVarianceAmount).toFixed(2),
    };
  });
  const approvedAmount = +lines.reduce((sum, line) => sum + line.approved_amount, 0).toFixed(2);
  const heldAmount = +(
    lines.reduce((sum, line) => sum + line.held_amount, 0)
    + unexpectedLines.reduce((sum, line) => sum + line.held_amount, 0)
  ).toFixed(2);
  return {
    ok: true,
    po_id: po.id,
    lines,
    unexpected_lines: unexpectedLines,
    approved_amount: approvedAmount,
    held_amount: heldAmount,
    can_approve_full_bill: heldAmount === 0 && unexpectedLines.length === 0,
    evidence_ids: expectedEvidenceIds,
  };
}

export function applyApprovedBillQuantities(po, match) {
  const remainingBySku = new Map(match.lines.map((line) => [line.sku, Number(line.approved_qty || 0)]));
  return {
    ...po,
    line_items: (po.line_items || []).map((line) => {
      const remaining = remainingBySku.get(line.sku) || 0;
      const accepted = po.po_type === 'consignment_settlement'
        ? Number(line.qty || 0)
        : Number(line.accepted_qty ?? line.received_qty ?? 0);
      const previouslyBilled = Number(line.billed_qty || 0);
      const available = Math.max(0, accepted - previouslyBilled);
      const allocated = Math.min(available, remaining);
      remainingBySku.set(line.sku, Math.max(0, remaining - allocated));
      const billedQty = previouslyBilled + allocated;
      return {
        ...line,
        billed_qty: billedQty,
        billable_qty: Math.max(0, accepted - billedQty),
      };
    }),
  };
}
