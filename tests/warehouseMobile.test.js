import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWarehouseBarcode,
  resolveMobileBarcode,
  quantityFrom,
  planMobileCount,
  countPostingWrites,
  inventorySnapshot,
  safeMap,
} from "../api/_lib/warehouseMobile.js";
import { atomicTransition } from "../api/_lib/atomicTransition.js";
const product = {
  id: "p",
  sku: "TEST",
  name: "Test item",
  barcode: "012345678905",
  lot_tracking: "required",
  expiration_tracking: "required",
  units_per_case: 12,
  pack_verified: true,
};
const inventory = {
  id: "inv",
  sku: "TEST",
  warehouse_id: "wh",
  on_hand: 30,
  reserved: 0,
};
const lot = {
  id: "lot",
  product_sku: "TEST",
  warehouse_id: "wh",
  bin_id: "bin",
  lot_number: "BATCH",
  expiration_date: "2028-06-30",
  qty_remaining: 30,
};
const bin = { id: "bin", warehouse_id: "wh" };
const session = { user_id: "operator", role: "warehouse_operator" };
const body = () => ({
  inventory_id: "inv",
  lot_id: "lot",
  bin_id: "bin",
  lot_number: "BATCH",
  expiration_date: "2028-06-30",
  cases: 2,
  eaches: 3,
  units_per_case: 12,
  confirmed: true,
  reason: "Monthly physical count",
  snapshot: inventorySnapshot(inventory, [lot]),
  idempotency_key: "fixture-count-001",
});
const plan = (changes = {}) =>
  planMobileCount({
    body: { ...body(), ...changes },
    session,
    product,
    inventory,
    lots: [lot],
    bin,
  });
test("GS1 scans extract GTIN, lot, serial and end-of-month expiry without inventing absent fields", () => {
  const p = parseWarehouseBarcode(
    "(01)00012345678905(17)280600(10)BATCH(21)SERIAL",
  );
  assert.equal(p.expiration, "2028-06-30");
  assert.equal(p.lot, "BATCH");
  assert.equal(p.serial, "SERIAL");
  assert.equal(
    parseWarehouseBarcode("]d201000123456789051728063010BATCH\x1d21SERIAL").lot,
    "BATCH",
  );
  assert.equal(parseWarehouseBarcode("(01)00012345678905(17)280231").ok, false);
  assert.equal(parseWarehouseBarcode("(01)00012345678905(10)A(10)B").ok, false);
  assert.equal(parseWarehouseBarcode("012345678905").expiration, null);
});
test("catalog resolution preserves ambiguous and unknown barcodes as blocked", () => {
  assert.equal(
    resolveMobileBarcode("012345678905", [product]).product.sku,
    "TEST",
  );
  assert.equal(
    resolveMobileBarcode("missing", [product]).reason,
    "barcode_unknown",
  );
  assert.equal(
    resolveMobileBarcode("012345678905", [
      product,
      { ...product, id: "other", sku: "OTHER" },
    ]).reason,
    "barcode_conflict",
  );
  assert.equal(
    resolveMobileBarcode("(01)00012345678905(10)BATCH", [product]).parsed.lot,
    "BATCH",
  );
});
test("case conversion requires verified catalog factor or explicit physical confirmation", () => {
  assert.equal(
    quantityFrom(
      { cases: 2, eaches: 3, units_per_case: 12 },
      { units_per_case: 12, pack_verified: true },
    ).units,
    27,
  );
  assert.equal(
    quantityFrom(
      { cases: 2, eaches: 3, units_per_case: 24 },
      { units_per_case: 12, pack_verified: true },
    ).ok,
    false,
  );
  for (const value of [-1, 1.5, NaN, Infinity, ""])
    assert.equal(quantityFrom({ cases: 0, eaches: value }, {}).ok, false);
  assert.equal(quantityFrom({ cases: 0, eaches: 0 }, {}).units, 0);
});
test("physical counts block missing traceability, identity, confirmation and stale inventory", () => {
  assert.equal(plan().record.variance, -3);
  for (const change of [
    { lot_number: "" },
    { expiration_date: "" },
    { expiration_date: "2028-02-31" },
    { confirmed: false },
    { cases: 0.5 },
    { snapshot: "stale" },
    { reason: "" },
    { lot_id: "wrong" },
    { lot_number: "OTHER" },
  ])
    assert.equal(plan(change).ok, false, JSON.stringify(change));
  const stale = { ...inventory, on_hand: 31 };
  assert.notEqual(inventorySnapshot(stale, [lot]), body().snapshot);
  const moved = { ...lot, bin_id: "other" };
  assert.notEqual(inventorySnapshot(inventory, [moved]), body().snapshot);
});
test("N/A needs product permission and a named attestation; required serial is enforced", () => {
  assert.equal(
    plan({
      lot_number: "N/A",
      expiration_date: "N/A",
      not_applicable_reason: "Not printed",
    }).ok,
    false,
  );
  const optional = {
    ...product,
    lot_tracking: "optional",
    expiration_tracking: "optional",
  };
  const input = {
    ...body(),
    lot_id: "",
    lot_number: "N/A",
    expiration_date: "N/A",
    whole_sku_confirmed: true,
    snapshot: inventorySnapshot(inventory, []),
  };
  assert.equal(
    planMobileCount({
      body: input,
      session,
      product: optional,
      inventory,
      lots: [],
      bin,
    }).reason,
    "traceability_na_attestation_required",
  );
  assert.equal(
    planMobileCount({
      body: {
        ...input,
        not_applicable_reason: "Packaging has no lot or expiry",
      },
      session,
      product: optional,
      inventory,
      lots: [],
      bin,
    }).ok,
    true,
  );
  assert.equal(
    planMobileCount({
      body: body(),
      session,
      product: { ...product, serial_required: true },
      inventory,
      lots: [lot],
      bin,
    }).reason,
    "serial_required",
  );
});
test("count approval atomically plans inventory, lot and append-only movement and rejects operators", () => {
  const record = plan().record;
  assert.equal(
    countPostingWrites(record, inventory, [lot], session, product).ok,
    false,
  );
  const posted = countPostingWrites(
    record,
    inventory,
    [lot],
    { user_id: "manager", role: "warehouse_manager" },
    product,
  );
  assert.equal(posted.ok, true);
  assert.equal(
    posted.writes.find((w) => w.table === "inventory").data.on_hand,
    27,
  );
  assert.equal(
    posted.writes.find((w) => w.table === "lots").data.qty_remaining,
    27,
  );
  assert.equal(
    posted.writes.find((w) => w.table === "stock_movements").data.qty_delta,
    -3,
  );
  assert.equal(
    countPostingWrites(
      record,
      { ...inventory, on_hand: 31 },
      [lot],
      { role: "admin" },
      product,
    ).reason,
    "inventory_changed_recount",
  );
});
test("zero is real count evidence; posting cannot consume reserved stock", () => {
  const record = plan({ cases: 0, eaches: 0 }).record;
  assert.equal(record.units, 0);
  assert.equal(
    countPostingWrites(
      record,
      { ...inventory, reserved: 4 },
      [lot],
      { role: "admin" },
      product,
    ).reason,
    "finish_reserved_orders_before_adjusting_stock",
  );
});
test("first opening lot requires entire balance attestation and does not double-count inventory", () => {
  const input = {
    ...body(),
    lot_id: "",
    snapshot: inventorySnapshot(inventory, []),
    whole_sku_confirmed: true,
  };
  const r = planMobileCount({
    body: input,
    session,
    product,
    inventory,
    lots: [],
    bin,
  });
  assert.equal(r.record.variance, -3);
  assert.equal(
    planMobileCount({
      body: { ...input, whole_sku_confirmed: false },
      session,
      product,
      inventory,
      lots: [],
      bin,
    }).ok,
    false,
  );
});
test("map geometry accepts only finite structural measurements", () => {
  const body = {
    name: "Receiving",
    surfaces: [{ kind: "wall", x: 0, z: 1, width: 5, angle: 0 }],
  };
  assert.equal(safeMap(body).ok, true);
  assert.equal(
    safeMap({ ...body, surfaces: [{ ...body.surfaces[0], width: -1 }] }).ok,
    false,
  );
  assert.equal(
    safeMap({ ...body, surfaces: [{ ...body.surfaces[0], x: Infinity }] }).ok,
    false,
  );
});
test("atomic writes share existing inventory handoff lock IDs and report a concurrency rollback", async () => {
  const calls = [];
  const tx = (strings, ...values) => {
    calls.push({ sql: strings.join("?"), values });
    return Promise.resolve([]);
  };
  const sql = { transaction: async (fn) => Promise.all(fn(tx)) };
  await atomicTransition(sql, {
    checks: [{ table: "inventory", id: "inv", before: inventory }],
    writes: [
      {
        table: "inventory",
        before: inventory,
        data: { ...inventory, on_hand: 27 },
      },
    ],
  });
  assert.ok(
    calls.some(
      (c) => c.sql.includes("pg_advisory_xact_lock") && c.values[0] === "inv",
    ),
  );
  assert.ok(calls.some((c) => c.sql.includes("FOR UPDATE")));
  assert.ok(calls.some((c) => c.sql.includes("1 / CASE")));
  assert.equal(
    (
      await atomicTransition(
        {
          transaction: async () => {
            throw Object.assign(new Error("conflict"), { code: "22012" });
          },
        },
        { writes: [] },
      )
    ).reason,
    "records_changed_refresh",
  );
});

test('container-scanned counts require whole-lot attestation',()=>{
  assert.equal(plan({container_id:'PALLET-1'}).reason,'confirm_entire_lot_not_single_container');
  assert.equal(plan({container_id:'PALLET-1',lot_scope_confirmed:true}).ok,true);
});
test('count submission serialization revisions do not invalidate physical stock snapshots',()=>{
  assert.equal(inventorySnapshot({...inventory,count_revision:9},[lot]),inventorySnapshot(inventory,[lot]));
  assert.notEqual(inventorySnapshot({...inventory,on_hand:29},[lot]),inventorySnapshot(inventory,[lot]));
});
