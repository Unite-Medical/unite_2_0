import crypto from "node:crypto";
import {
  trackingPolicyForProduct,
  validateTrackingCapture,
  isNotApplicable,
} from "../../src/lib/productTracking.js";

export const MOBILE_ROLES = [
  "admin",
  "warehouse_manager",
  "warehouse_operator",
];
export const manager = (session) =>
  ["admin", "warehouse_manager"].includes(session?.role);
export const revision = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const ident = (prefix, value) =>
  prefix + "_" + revision(value).slice(0, 24);
const text = (value) => String(value ?? "").trim();
const fail = (reason) => ({ ok: false, reason });
export const whole = (n) =>
  Number.isSafeInteger(n) && n >= 0 && n <= 1000000000;
const gtin = (s) => (/^\d{8}$|^\d{12,14}$/.test(s) ? s.padStart(14, "0") : s);
export function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

// Parse only recognized GS1 application identifiers; never guess variable-field boundaries.
export function parseWarehouseBarcode(raw) {
  let s = text(raw).replace(/^\](?:C1|d2|Q3)/, "");
  const values = {};
  if (s.startsWith("(")) {
    const parts = [...s.matchAll(/\((\d{2,4})\)([^()]*)/g)];
    if (parts.map((m) => m[0]).join("") !== s) return fail("invalid_gs1");
    for (const m of parts) {
      if (values[m[1]]) return fail("duplicate_gs1_field");
      values[m[1]] = m[2];
    }
  } else if (!/^\d{8}$|^\d{12,14}$/.test(s) && /^(01|00)/.test(s)) {
    while (s) {
      if (s.startsWith(String.fromCharCode(29))) s = s.slice(1);
      if (!s) break;
      const ai = s.slice(0, 2);
      s = s.slice(2);
      const size = { "00": 18, "01": 14, 17: 6, 11: 6, 15: 6 }[ai];
      if (values[ai]) return fail("duplicate_gs1_field");
      if (size) {
        if (s.length < size) return fail("invalid_gs1");
        values[ai] = s.slice(0, size);
        s = s.slice(size);
      } else if (["10", "21", "30", "37"].includes(ai)) {
        const end = s.indexOf("\x1d");
        values[ai] = end < 0 ? s : s.slice(0, end);
        s = end < 0 ? "" : s.slice(end + 1);
      } else return fail("unsupported_gs1_field");
    }
  }
  let expiration = null;
  if (values["17"]) {
    const v = values["17"];
    if (!/^\d{6}$/.test(v)) return fail("invalid_expiration");
    const year = 2000 + Number(v.slice(0, 2)),
      month = Number(v.slice(2, 4));
    const day =
      Number(v.slice(4)) || new Date(Date.UTC(year, month, 0)).getUTCDate();
    expiration = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!validDate(expiration)) return fail("invalid_expiration");
  }
  if (values["01"] && !/^\d{14}$/.test(values["01"]))
    return fail("invalid_gtin");
  return {
    ok: true,
    raw: text(raw),
    code: values["01"] || text(raw),
    gtin: values["01"] || null,
    lot: values["10"] || null,
    expiration,
    serial: values["21"] || null,
    sscc: values["00"] || null,
  };
}
export function mobileProduct(p) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name || p.title || p.sku,
    barcode: p.barcode || p.upc || p.gtin || "",
    units_per_case:
      whole(Number(p.units_per_case)) && Number(p.units_per_case) > 0
        ? Number(p.units_per_case)
        : null,
    pack_verified:
      p.pack_verified === true || p.pack_conversion_verified === true,
    policy: trackingPolicyForProduct(p),
  };
}
export function resolveMobileBarcode(raw, products = [], variants = []) {
  const parsed = parseWarehouseBarcode(raw);
  if (!parsed.ok) return parsed;
  const code = gtin(parsed.code),
    rows = [...products, ...variants];
  const matches = rows.filter(
    (p) =>
      text(p.sku) === text(raw) ||
      [p.barcode, p.upc, p.gtin, p.case_barcode]
        .filter(Boolean)
        .some((v) => gtin(text(v)) === code),
  );
  const skus = [...new Set(matches.map((p) => p.sku).filter(Boolean))];
  if (skus.length !== 1)
    return {
      ...fail(skus.length ? "barcode_conflict" : "barcode_unknown"),
      parsed,
    };
  const base = products.find((p) => p.sku === skus[0]) || matches[0];
  const variant = matches.find((p) => p.sku === skus[0]);
  return { ok: true, product: mobileProduct({ ...base, ...variant }), parsed };
}
export function quantityFrom(body, product) {
  const cases = Number(body.cases),
    eaches = Number(body.eaches),
    factor = Number(body.units_per_case);
  if (
    body.cases === "" ||
    body.eaches === "" ||
    !whole(cases) ||
    !whole(eaches)
  )
    return fail("whole_cases_and_eaches_required");
  if (cases > 0 && (!whole(factor) || factor < 1))
    return fail("case_size_required");
  if (
    cases > 0 &&
    !(product.pack_verified && factor === product.units_per_case) &&
    body.pack_confirmed !== true
  )
    return fail("confirm_case_size");
  const units = cases * (cases > 0 ? factor : 0) + eaches;
  if (!whole(units)) return fail("quantity_too_large");
  return { ok: true, units, cases, eaches, units_per_case: factor || null };
}
const ownerKey = (r) =>
  `${r.owner_type || r.inventory_owner_type || "unite"}:${r.owner_org_id || r.inventory_owner_org_id || ""}`;
export function inventorySnapshot(inventory, lots) {
  const { count_revision: _countRevision, ...stock } = inventory;
  return revision({
    inventory: stock,
    lots: lots
      .filter(
        (l) =>
          l.product_sku === inventory.sku &&
          l.warehouse_id === inventory.warehouse_id &&
          ownerKey(l) === ownerKey(inventory),
      )
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export function planMobileCount({
  body,
  session,
  product,
  inventory,
  lots = [],
  bin,
  now = new Date(),
}) {
  if (!MOBILE_ROLES.includes(session?.role))
    return fail("warehouse_access_required");
  if (!inventory || !product || inventory.sku !== product.sku)
    return fail("inventory_product_required");
  if ((inventory.owner_type || "unite") !== "unite")
    return fail("use_consignment_workspace_for_distributor_stock");
  if (!bin || bin.warehouse_id !== inventory.warehouse_id)
    return fail("valid_location_required");
  if (body.confirmed !== true) return fail("physical_confirmation_required");
  if (!text(body.reason)) return fail("count_reason_required");
  if (body.snapshot !== inventorySnapshot(inventory, lots))
    return fail("inventory_changed_recount");
  const q = quantityFrom(body, mobileProduct(product));
  if (!q.ok) return q;
  const trace = {
    lot_number: body.lot_number,
    expiration_date: body.expiration_date,
    serial_number: body.serial_number,
    udi: body.udi,
    capture_method: body.capture_method || "manual",
    actor_id: session.user_id,
    not_applicable_reason: body.not_applicable_reason,
  };
  const validation = validateTrackingCapture(
    product.sku,
    trackingPolicyForProduct(product),
    trace,
  );
  if (!validation.ok) return validation;
  if (
    !isNotApplicable(trace.expiration_date) &&
    !validDate(trace.expiration_date)
  )
    return fail("valid_expiration_required");
  const poolLots = lots.filter(
    (l) =>
      l.product_sku === inventory.sku &&
      l.warehouse_id === inventory.warehouse_id &&
      ownerKey(l) === ownerKey(inventory),
  );
  let lot = body.lot_id ? poolLots.find((l) => l.id === body.lot_id) : null;
  if (body.lot_id && !lot) return fail("lot_not_found");
  if (body.container_id && body.lot_scope_confirmed !== true) return fail("confirm_entire_lot_not_single_container");
  if (!lot && poolLots.length)
    return fail("choose_existing_lot_or_receive_new_lot");
  if (
    lot &&
    (text(lot.lot_number) !== text(trace.lot_number) ||
      (lot.expiration_date || "N/A") !==
        (isNotApplicable(trace.expiration_date)
          ? "N/A"
          : trace.expiration_date))
  )
    return fail("lot_traceability_mismatch");
  if (lot?.bin_id && lot.bin_id !== bin.id)
    return fail("count_at_existing_lot_location");
  if (lot && Number(lot.qty_remaining) < 0) return fail("invalid_lot_balance");
  const expected = Number(lot ? lot.qty_remaining : inventory.on_hand);
  const delta = q.units - expected;
  if (!whole(expected) || !whole(Number(inventory.on_hand) + delta))
    return fail("count_conflicts_with_reserved_stock");
  // A first lot represents the ENTIRE previously unallocated SKU balance.
  if (!lot && body.whole_sku_confirmed !== true)
    return fail("confirm_entire_sku_at_location");
  const at = now.toISOString();
  const id = ident(
    "mobile_count",
    `${session.user_id}:${body.idempotency_key}`,
  );
  const record = {
    id,
    sku: inventory.sku,
    inventory_id: inventory.id,
    warehouse_id: inventory.warehouse_id,
    bin_id: bin.id,
    lot_id: lot?.id || null,
    ...q,
    lot_number: text(trace.lot_number),
    expiration_date: isNotApplicable(trace.expiration_date)
      ? null
      : trace.expiration_date,
    expiration_not_applicable: isNotApplicable(trace.expiration_date),
    serial_number: text(trace.serial_number),
    udi: text(trace.udi),
    not_applicable_reason: text(body.not_applicable_reason),
    capture_method: trace.capture_method,
    raw_barcode: text(body.raw_barcode),
    expected_units: expected,
    variance: delta,
    snapshot: body.snapshot,
    reason: text(body.reason),
    counted_by: session.user_id,
    counted_at: at,
    status: "pending",
    task_id: body.task_id || null,
    corrects_id: body.corrects_id || null,
  };
  return { ok: true, record, lot, delta };
}
export function countPostingWrites(record, inventory, lots, session, product) {
  if (record.allocations) return openingPostingWrites(record,inventory,lots,session,product);
  if (!manager(session)) return fail("manager_approval_required");
  const trace = validateTrackingCapture(
    record.sku,
    trackingPolicyForProduct(product),
    {
      ...record,
      expiration_date: record.expiration_date || "N/A",
      actor_id: record.counted_by,
    },
  );
  if (!trace.ok) return trace;
  if (record.variance !== 0 && Number(inventory.reserved || 0) > 0)
    return fail("finish_reserved_orders_before_adjusting_stock");
  if (record.status !== "pending") return fail("count_already_reviewed");
  if (record.snapshot !== inventorySnapshot(inventory, lots))
    return fail("inventory_changed_recount");
  if (
    Number(inventory.on_hand) + record.variance <
    Number(inventory.reserved || 0)
  )
    return fail("count_conflicts_with_reserved_stock");
  const oldLot = record.lot_id
    ? lots.find((l) => l.id === record.lot_id)
    : null;
  const lot = oldLot
    ? { ...oldLot, qty_remaining: record.units }
    : {
        id: ident("lot", record.id),
        product_sku: record.sku,
        warehouse_id: record.warehouse_id,
        bin_id: record.bin_id,
        owner_type: inventory.owner_type || "unite",
        owner_org_id: inventory.owner_org_id || null,
        lot_number: record.lot_number,
        expiration_date: record.expiration_date,
        expiration_not_applicable: record.expiration_not_applicable,
        serial_number: record.serial_number,
        udi: record.udi,
        not_applicable_reason: record.not_applicable_reason,
        qty_received: record.units,
        qty_remaining: record.units,
        status: "available",
        received_at: record.counted_at,
        source: "verified_opening_count",
      };
  const at = new Date().toISOString();
  const movement = {
    id: ident("mov", record.id),
    sku: record.sku,
    product_sku: record.sku,
    warehouse_id: record.warehouse_id,
    bin_id: record.bin_id,
    lot_id: lot.id,
    owner_type: lot.owner_type,
    owner_org_id: lot.owner_org_id,
    qty_delta: record.variance,
    reason: oldLot ? "count_variance" : "opening_count",
    ref_type: "count",
    ref_id: record.id,
    actor_id: session.user_id,
    occurred_at: at,
    idempotency_key: record.id,
  };
  const writes = [
    {
      table: "warehouse_counts",
      before: record,
      data: {
        ...record,
        status: "posted",
        approved_by: session.user_id,
        approved_at: at,
        posted_lot_id: lot.id,
      },
    },
    {
      table: "inventory",
      before: inventory,
      data: {
        ...inventory,
        on_hand: Number(inventory.on_hand) + record.variance,
      },
    },
    { table: "lots", before: oldLot, data: lot },
  ];
  if (record.variance !== 0)
    writes.push({ table: "stock_movements", before: null, data: movement });
  return {
    ok: true,
    writes,
    checks: [
      { table: "products", id: product.id, before: product },
      ...lots
        .filter(
          (l) =>
            l.product_sku === record.sku &&
            l.warehouse_id === record.warehouse_id,
        )
        .map((l) => ({ table: "lots", id: l.id, before: l })),
    ],
  };
}
export function safeMap(body) {
  if (
    !text(body.name) ||
    !Array.isArray(body.surfaces) ||
    body.surfaces.length > 2000
  )
    return fail("invalid_area_scan");
  const surfaces = [];
  for (const s of body.surfaces) {
    if (
      !["wall", "door", "window", "opening"].includes(s.kind) ||
      ![s.x, s.z, s.width, s.angle].every(Number.isFinite) ||
      s.width <= 0 ||
      s.width > 200 ||
      Math.abs(s.x) > 200 || Math.abs(s.z) > 200 ||
      (s.y !== undefined && (!Number.isFinite(s.y) || Math.abs(s.y) > 100)) ||
      (s.height !== undefined && (!Number.isFinite(s.height) || s.height <= 0 || s.height > 100))
    )
      return fail("invalid_map_geometry");
    surfaces.push({
      kind: s.kind,
      x: s.x,
      z: s.z,
      width: s.width,
      angle: s.angle,
      ...(s.y !== undefined ? { y: s.y } : {}),
      ...(s.height !== undefined ? { height: s.height } : {}),
    });
  }
  return {
    ok: true,
    name: text(body.name).slice(0, 100),
    surfaces,
    source: body.source === "manual_layout" ? "manual_layout" : "RoomPlan",
    coordinate_system: "local_area_metres",
  };
}

export function resolveSpatialBarcode(raw, products, variants, containers, lots) {
  const parsed = parseWarehouseBarcode(raw);
  if (!parsed.ok) return parsed;
  const box = containers.find((c) => c.id === text(raw) || (parsed.sscc && c.id === parsed.sscc));
  const resolved = resolveMobileBarcode(raw, products, variants);
  if (!box) return resolved;
  if ((resolved.ok && resolved.product.sku !== box.sku) || resolved.reason === 'barcode_conflict') return fail('barcode_conflict');
  const lot = lots.find((l) => l.id === box.lot_id);
  const product = [...products, ...variants].find((p) => p.sku === box.sku);
  if (!product || !lot || lot.product_sku !== box.sku || lot.warehouse_id !== box.warehouse_id) return fail('container_records_incomplete');
  return { ok:true, product:mobileProduct(product), parsed:{...parsed,lot:lot.lot_number || null,expiration:lot.expiration_date || null,serial:lot.serial_number || null}, container:{id:box.id,bin_id:box.bin_id,warehouse_id:box.warehouse_id,lot_id:box.lot_id} };
}

// An opening worksheet reconciles a whole SKU pool once, then allocates that
// verified total across physical lots/locations. Never add each line to stock.
export function planOpeningCount({ body, session, inventory, lots = [], product, bins = [] }) {
  if (!inventory || lots.some(l => l.product_sku === inventory.sku && l.warehouse_id === inventory.warehouse_id && ownerKey(l) === ownerKey(inventory))) return fail('opening_count_requires_unallocated_balance');
  if (body.whole_sku_confirmed !== true || body.confirmed !== true) return fail('confirm_complete_opening_worksheet');
  if (!Array.isArray(body.allocations) || !body.allocations.length || body.allocations.length > 100) return fail('opening_lines_required_max_100');
  const allocations = [], seen = new Set();
  for (const line of body.allocations) {
    const planned = planMobileCount({body:{...line,inventory_id:inventory.id,lot_id:'',confirmed:true,whole_sku_confirmed:true,reason:body.reason,snapshot:body.snapshot,idempotency_key:body.idempotency_key}, session,inventory,lots,product,bin:bins.find(b=>b.id===line.bin_id)});
    if (!planned.ok) return planned;
    const key = JSON.stringify([line.bin_id,planned.record.lot_number,planned.record.serial_number]);
    if (seen.has(key)) return fail('combine_duplicate_lot_and_location_lines');
    seen.add(key); allocations.push(planned.record);
  }
  const units = allocations.reduce((n,a)=>n+a.units,0);
  if (!whole(units)) return fail('opening_total_out_of_range');
  return {ok:true,record:{...allocations[0],kind:'opening_worksheet',allocations,units,expected_units:Number(inventory.on_hand),variance:units-Number(inventory.on_hand),reason:text(body.reason),whole_sku_confirmed:true}};
}
function openingPostingWrites(record, inventory, lots, session, product) {
  if (!Array.isArray(record.allocations) || !record.allocations.length || record.allocations.length > 100 || record.allocations.reduce((n,a)=>n+a.units,0)!==record.units) return fail('invalid_opening_worksheet');
  for (const a of record.allocations) {
    if (!whole(a.units) || a.sku!==record.sku || a.warehouse_id!==record.warehouse_id || a.lot_id) return fail('invalid_opening_worksheet');
    const validation=validateTrackingCapture(record.sku,trackingPolicyForProduct(product),{...a,expiration_date:a.expiration_date||'N/A',actor_id:record.counted_by});
    if(!validation.ok)return validation;
  }
  if (lots.some(l=>l.product_sku===record.sku && l.warehouse_id===record.warehouse_id && ownerKey(l)===ownerKey(inventory))) return fail('opening_count_requires_unallocated_balance');
  const { allocations: _allocations, ...single } = record;
  const base = countPostingWrites(single,inventory,lots,session,product);
  if (!base.ok) return base;
  const template=base.writes.find(w=>w.table==='lots').data;
  const created=record.allocations.map((a,i)=>({...template,id:ident('lot',`${record.id}:${i}`),bin_id:a.bin_id,lot_number:a.lot_number,expiration_date:a.expiration_date,expiration_not_applicable:a.expiration_not_applicable,serial_number:a.serial_number,udi:a.udi,not_applicable_reason:a.not_applicable_reason,qty_received:a.units,qty_remaining:a.units}));
  base.writes=base.writes.filter(w=>w.table!=='lots').map(w=> w.table==='warehouse_counts' ? {...w,before:record,data:{...w.data,allocations:record.allocations,posted_lot_id:null,posted_lot_ids:created.map(l=>l.id)}} : w.table==='stock_movements' ? {...w,data:{...w.data,lot_id:null,bin_id:null,allocations:created.map(l=>({lot_id:l.id,bin_id:l.bin_id,units:l.qty_remaining}))}} : w);
  base.writes.push(...created.map(l=>({table:'lots',before:null,data:l})));
  return base;
}
