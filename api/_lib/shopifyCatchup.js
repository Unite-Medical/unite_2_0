import crypto from 'node:crypto';

const KIND = 'shopify_historical_catchup_v1';
const copy = value => structuredClone(value);
function fail(reason) { throw new Error(reason); }

// Hash JSON canonically so object-key order and Postgres JSONB serialization do not affect guards.
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return fail('non_json_evidence');
}
export function shopifyCatchupHash(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
export function normalizeShopifyId(value, resource = 'Order') {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('unsafe_shopify_id');
  if (!['string', 'number'].includes(typeof value)) fail('invalid_shopify_id');
  const text = String(value);
  const gid = text.match(/^gid:\/\/shopify\/([A-Za-z]+)\/([1-9]\d*)$/);
  if (gid && gid[1] !== resource) fail('wrong_shopify_resource');
  const id = gid ? gid[2] : text;
  if (!/^[1-9]\d*$/.test(id)) fail('invalid_shopify_id');
  return id;
}
function ids(values, resource = 'Order') {
  if (!Array.isArray(values)) fail('ids_array_required');
  const normalized = values.map(value => normalizeShopifyId(value, resource));
  if (new Set(normalized).size !== normalized.length) fail('duplicate_shopify_ids');
  return normalized;
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) fail('invalid_' + label);
  return value;
}
function money(value, label, optional = false) {
  if (optional && (value === undefined || value === null)) return null;
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !/^\d+(\.\d+)?$/.test(String(value))) fail('invalid_' + label);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000000) fail('invalid_' + label);
  return n;
}
function quantity(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail('invalid_' + label);
  return value;
}
function rows(values) {
  if (!Array.isArray(values)) fail('snapshot_array_required');
  return values.map(row => ({ data: row.data || row, deleted: row.deleted === true, rowId: row.id }));
}
function address(value) {
  if (!value) return {};
  return Object.fromEntries([
    ['recipient', value.name || [value.first_name, value.last_name].filter(Boolean).join(' ')],
    ['company', value.company || ''], ['address1', value.address1 || ''], ['address2', value.address2 || ''],
    ['city', value.city || ''], ['province', value.province_code || value.province || ''],
    ['zip', value.zip || ''], ['country', value.country_code || value.country || ''], ['phone', value.phone || ''],
  ]);
}
function recordHash(record) {
  const value = copy(record);
  if (value.catchup_import) delete value.catchup_import.record_sha256;
  return shopifyCatchupHash(value);
}
function sourceIdentity(record) {
  const values = [record.id, record.shopify_order_id, record.source_order_id, record.source?.id, record.catchup_import?.source_order_id].filter(value => value !== undefined && value !== null && value !== '');
  return values.flatMap(value => {
    try { return [normalizeShopifyId(value)]; } catch { return []; }
  });
}
function mapLine(line, products) {
  const id = normalizeShopifyId(line.id, 'LineItem');
  const variant = line.variant_id == null ? null : normalizeShopifyId(line.variant_id, 'ProductVariant');
  const matches = variant ? products.filter(product => [product.variant_id, product.id].filter(Boolean).some(value => {
    try { return normalizeShopifyId(value, 'ProductVariant') === variant; } catch { return false; }
  })) : [];
  if (matches.length !== 1) fail(matches.length ? 'ambiguous_variant_mapping' : 'missing_variant_mapping');
  const product = matches[0];
  if (product.variant_id && normalizeShopifyId(product.variant_id, 'ProductVariant') !== variant) fail('conflicting_variant_identity');
  if (product.product_id && line.product_id != null && normalizeShopifyId(product.product_id, 'Product') !== normalizeShopifyId(line.product_id, 'Product')) fail('conflicting_product_identity');
  const original = quantity(line.quantity, 'original_quantity');
  const current = quantity(line.current_quantity, 'current_quantity');
  const remaining = quantity(line.fulfillable_quantity, 'remaining_quantity');
  if (current > original || remaining > current) fail('inconsistent_source_quantity');
  const gross = money(line.price, 'line_price');
  const discount = money(line.total_discount, 'line_discount', true);
  const allocations = Array.isArray(line.discount_allocations) ? line.discount_allocations : [];
  const allocationTotal = allocations.reduce((sum, allocation) => sum + money(allocation.amount, 'discount_allocation'), 0);
  // Shopify total_discount is line-level evidence. Allocation totals are kept separately;
  // disagreeing evidence is blocked instead of choosing or inventing a discount.
  if (discount !== null && allocations.length && Math.abs(discount - allocationTotal) > 0.000001) fail('conflicting_line_discount_evidence');
  const discountTotal = discount ?? (allocations.length ? allocationTotal : null);
  if (discountTotal !== null && discountTotal > gross * original + 0.000001) fail('discount_exceeds_original_line');
  const netUnit = discountTotal === null ? null : original ? (gross * original - discountTotal) / original : null;
  const displayUnit = netUnit ?? gross;
  return {
    id, source_line_id: id, source_variant_id: variant,
    source_product_id: line.product_id == null ? null : normalizeShopifyId(line.product_id, 'Product'),
    product_id: String(product.id), variant_id: product.variant_id || `gid://shopify/ProductVariant/${variant}`,
    sku: line.sku || '', source_sku: line.sku || '', catalog_sku: product.sku || '',
    name: line.name || line.title || '', variant: line.variant_title || '', image: product.image || '',
    quantity: current, current_quantity: current, original_quantity: original,
    unfulfilled_quantity: remaining, fulfillable_quantity: remaining,
    removed: current === 0, line_fulfillment_status: line.fulfillment_status ?? null,
    unit_price: displayUnit, retail: gross, gross_unit_price: gross,
    original_net_unit_price: netUnit, original_net_line_total: discountTotal === null ? null : gross * original - discountTotal,
    source_total_discount: discount, discount_allocations_total: allocations.length ? allocationTotal : null,
    discount_allocations: copy(allocations), pricing_basis: netUnit === null ? 'source_gross_unit_price' : 'source_original_line_discount_per_original_quantity',
    current_net_line_total: current === original && netUnit !== null ? gross * original - discountTotal : null,
    mapping_status: 'matched', source: copy(line),
  };
}
function fulfillments(source) {
  return (source || []).map(f => {
    const numbers = Array.isArray(f.tracking_numbers) ? f.tracking_numbers : f.tracking_number ? [f.tracking_number] : [];
    const urls = Array.isArray(f.tracking_urls) ? f.tracking_urls : f.tracking_url ? [f.tracking_url] : [];
    return {
      ...copy(f), createdAt: f.created_at || null, updatedAt: f.updated_at || null,
      // Raw arrays and scalar fields above retain all evidence, even unequal tracking array lengths.
      trackingInfo: Array.from({ length: Math.max(numbers.length, urls.length) }, (_, index) => ({
        company: f.tracking_company || '', number: numbers[index] || '', url: urls[index] || '',
      })),
    };
  });
}
function mapOrder(source, context) {
  const id = normalizeShopifyId(source.id);
  const customerId = source.customer?.id == null ? null : normalizeShopifyId(source.customer.id, 'Customer');
  const matches = customerId ? context.customers.filter(customer => {
    try { return normalizeShopifyId(customer.id, 'Customer') === customerId; } catch { return false; }
  }) : [];
  if (matches.length > 1) fail('ambiguous_customer_mapping');
  if (!matches.length && !context.pendingCustomers.has(id)) fail('missing_customer_mapping');
  if (!Array.isArray(source.line_items) || !source.line_items.length) fail('source_lines_required');
  const lines = source.line_items.map(line => mapLine(line, context.products));
  if (new Set(lines.map(line => line.id)).size !== lines.length) fail('duplicate_source_line_id');
  const cancelled = Boolean(source.cancelled_at);
  const restocked = source.fulfillment_status === 'restocked';
  const fulfillment = source.fulfillment_status ?? 'unfulfilled';
  const review = [];
  if (!matches.length) review.push('Customer mapping pending: retain source Shopify customer identity; match to an existing verified customer. No customer profile was created.');
  if (cancelled || restocked) review.push('Historical canceled/restocked source order. Review source cancellation and refund evidence; no operational fulfillment or inventory action is created.');
  if (lines.some(line => line.current_quantity !== line.original_quantity && line.current_quantity > 0 && line.source_total_discount)) review.push('Changed quantities retain original line discount evidence; current net line amount requires source review.');
  const record = {
    id, number: source.name, shopify_order_id: id, source_order_id: id,
    customer_id: matches.length ? String(matches[0].id) : '', source_customer_id: customerId,
    customer_mapping_status: matches.length ? 'matched' : 'pending', email: source.email || '',
    historical: true, draft: false, revision: 0, created_at: timestamp(source.created_at, 'source_created_at'),
    updated_at: timestamp(source.updated_at, 'source_updated_at'),
    financial_status: source.financial_status ?? null, fulfillment_status: fulfillment,
    source_fulfillment_status: source.fulfillment_status ?? null,
    cancelled_at: source.cancelled_at || null, cancel_reason: source.cancel_reason ?? null, closed_at: source.closed_at || null,
    workflow_state: cancelled || restocked ? 'archived' : fulfillment === 'fulfilled' ? 'complete' : 'needs_review',
    archive_reason: cancelled || restocked ? 'Historical Shopify canceled/restocked order; source state retained.' : '',
    review_note: review.join(' '),
    total: money(source.current_total_price, 'current_total'), subtotal: money(source.current_subtotal_price, 'current_subtotal'),
    tax: money(source.current_total_tax, 'current_tax'),
    shipping: money(source.total_shipping_price_set?.shop_money?.amount, 'source_shipping', true),
    discount: money(source.total_discounts, 'source_discount', true),
    total_outstanding: money(source.total_outstanding, 'source_outstanding'),
    currency: source.currency, notes: source.note || '', po_number: source.po_number || '',
    tags: Array.isArray(source.tags) ? copy(source.tags) : String(source.tags || '').split(',').map(tag => tag.trim()).filter(Boolean),
    payment_method: (source.payment_gateway_names || []).join(', '),
    payment_amount_status: 'not_inferred_from_shopify_financial_status',
    lines, shipping_address: address(source.shipping_address), billing_address: address(source.billing_address),
    fulfillments: fulfillments(source.fulfillments), refunds: copy(source.refunds || []),
    refund_liability: null, events: [], source: copy(source),
    catchup_import: {
      kind: KIND, schema_version: 1, run_id: context.runId, source_order_id: id,
      source_payload_sha256: shopifyCatchupHash(source), source_updated_at: source.updated_at,
      source_retrieved_at: context.retrievedAt, actor: copy(context.actor),
      baseline_plan_sha256: context.baselinePlanHash, allowed_ids_sha256: context.allowedHash,
    },
  };
  record.catchup_import.record_sha256 = recordHash(record);
  return record;
}

/** Pure insert-only plan. Production callers must provide all 48 approved stable IDs.
 * Tests can explicitly use scope: { kind: 'test', expectedCount: N }.
 * Missing customers are blocked unless their exact order ID is in pendingCustomerOrderIds.
 */
export function planShopifyCatchup({ allowedIds, sourceOrders, existingOrders = [], customers = [], products = [],
  runId, retrievedAt, actor, baselinePlanHash, pendingCustomerOrderIds = [], scope = { kind: 'production', expectedCount: 48 } }) {
  const allowed = ids(allowedIds).sort();
  if (!scope || !['production', 'test'].includes(scope.kind) || !Number.isInteger(scope.expectedCount) || scope.expectedCount < 1 || scope.expectedCount > 48 || (scope.kind === 'production' && scope.expectedCount !== 48)) fail('invalid_catchup_scope');
  if (allowed.length !== scope.expectedCount) fail('catchup_scope_count_mismatch');
  if (!Array.isArray(sourceOrders)) fail('source_orders_required');
  const sourceIds = ids(sourceOrders.map(order => order.id)).sort();
  if (canonical(sourceIds) !== canonical(allowed)) fail('source_ids_do_not_match_approved_scope');
  if (typeof runId !== 'string' || !runId.trim() || runId.length > 200) fail('run_id_required');
  timestamp(retrievedAt, 'retrieved_at');
  if (!actor || (typeof actor === 'string' ? !actor.trim() : typeof actor !== 'object' || Array.isArray(actor) || !Object.keys(actor).length)) fail('actor_required');
  if (typeof baselinePlanHash !== 'string' || !/^[a-f0-9]{64}$/.test(baselinePlanHash)) fail('baseline_plan_sha256_required');
  const pending = ids(pendingCustomerOrderIds);
  if (pending.some(id => !allowed.includes(id))) fail('pending_customer_exception_outside_scope');
  const customerRows = rows(customers).filter(row => !row.deleted).map(row => row.data);
  const productRows = rows(products).filter(row => !row.deleted).map(row => row.data);
  const existing = rows(existingOrders);
  const context = { runId, retrievedAt, actor, baselinePlanHash, customers: customerRows, products: productRows, pendingCustomers: new Set(pending), allowedHash: shopifyCatchupHash(allowed) };
  const inserts = [], skipped = [], conflicts = [];
  for (const source of [...sourceOrders].sort((a, b) => normalizeShopifyId(a.id).localeCompare(normalizeShopifyId(b.id)))) {
    const id = normalizeShopifyId(source.id);
    let record;
    try { record = mapOrder(source, context); } catch (error) { conflicts.push({ id, status: 'blocked', reason: error.message }); continue; }
    const matches = existing.filter(row => sourceIdentity(row.data).includes(id) || String(row.rowId) === id || (source.name && row.data.number === source.name));
    if (matches.length) {
      const row = matches[0], audit = row.data.catchup_import;
      if (matches.length === 1 && !row.deleted && row.data.historical === true && audit?.kind === KIND && sourceIdentity(row.data).includes(id)
        && audit.source_payload_sha256 === record.catchup_import.source_payload_sha256 && audit.record_sha256 === recordHash(row.data)
        && recordHash({ ...record, catchup_import: { ...record.catchup_import, ...audit, record_sha256: undefined } }) === audit.record_sha256) {
        skipped.push({ id, status: 'skipped', reason: 'unchanged_same_imported_payload', run_id: audit.run_id });
      } else conflicts.push({ id, status: 'blocked', reason: row.deleted ? 'existing_deleted_row' : 'existing_conflicting_or_edited_row' });
    } else inserts.push({ table: 'commerce_orders', id, data: record });
  }
  return { ok: conflicts.length === 0, status: conflicts.length ? 'blocked' : 'ready', run_id: runId,
    allowed_ids: allowed, allowed_ids_sha256: context.allowedHash, inserts, skipped, conflicts,
    counts: { allowed: allowed.length, insert: inserts.length, skipped: skipped.length, blocked: conflicts.length } };
}

/** No mutation: exact stored hashes are optimistic guards for the caller's soft delete transaction. */
export function planShopifyCatchupRollback({ runId, createdRows, existingOrders }) {
  if (!runId || !Array.isArray(createdRows) || !createdRows.length) fail('rollback_run_and_created_rows_required');
  const existing = rows(existingOrders), seen = new Set(), softDeletes = [], conflicts = [];
  for (const entry of createdRows) {
    if (entry.table !== 'commerce_orders' || seen.has(entry.id)) fail('invalid_rollback_created_rows');
    seen.add(entry.id);
    const created = entry.data, matches = existing.filter(row => String(row.rowId || row.data.id) === String(entry.id));
    const row = matches[0], audit = created?.catchup_import;
    if (matches.length !== 1 || row.deleted || audit?.kind !== KIND || audit.run_id !== runId || row.data.catchup_import?.run_id !== runId || audit.record_sha256 !== recordHash(created) || shopifyCatchupHash(row.data) !== shopifyCatchupHash(created)) {
      conflicts.push({ id: entry.id, status: 'blocked', reason: 'rollback_row_missing_edited_deleted_or_not_created_by_run' });
    } else softDeletes.push({ table: 'commerce_orders', id: entry.id, expected_record_sha256: audit.record_sha256, expected_data_sha256: shopifyCatchupHash(created), run_id: runId });
  }
  return { ok: conflicts.length === 0, softDeletes, conflicts };
}
