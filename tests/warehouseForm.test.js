import test from "node:test";
import assert from "node:assert/strict";
import { warehouseFormState, calendarDate } from "../src/lib/warehouseForm.js";
const base = () => ({
  mode: "count",
  product: {
    pack_verified: true,
    units_per_case: 12,
    policy: { lot: "required", expiration: "required" },
  },
  inventory: { snapshot: "v1" },
  baseline: { snapshot: "v1" },
  lots: [{ id: "lot" }],
  form: {
    sku: "SKU",
    warehouse_id: "warehouse",
    bin_id: "bin",
    cases: "2",
    eaches: "6",
    units_per_case: "12",
    lot_id: "lot",
    lot_scope_confirmed: true,
    lot_number: "L1",
    expiration_date: "2028-02-29",
    reason: "Monthly check",
    confirmed: true,
  },
});
test("warehouse readiness totals verified cases and eaches and requires physical confirmation", () => {
  const x = base();
  assert.equal(warehouseFormState(x).total, 30);
  assert.equal(warehouseFormState(x).ready, true);
  x.form.confirmed = false;
  assert.equal(warehouseFormState(x).ready, false);
});
test("invalid dates, mandatory N/A and missing serial or UDI cannot appear ready", () => {
  for (const date of ["2027-02-29", "2028-13-10", "N/A", ""]) {
    const x = base();
    x.form.expiration_date = date;
    assert.equal(warehouseFormState(x).ready, false);
  }
  assert.equal(calendarDate("2028-02-29"), true);
  for (const field of ["serial", "udi"]) {
    const x = base();
    x.product.policy[field] = "required";
    assert.equal(warehouseFormState(x).ready, false);
  }
});
test("stale count, distributor balance and partial opening count are blocked", () => {
  let x = base();
  x.baseline.snapshot = "old";
  assert.equal(warehouseFormState(x).ready, false);
  x = base();
  x.inventory.owner_type = "distributor";
  assert.equal(warehouseFormState(x).ready, false);
  x = base();
  x.form.lot_id = "";
  x.form.whole_sku_confirmed = true;
  assert.equal(warehouseFormState(x).ready, false);
  x.lots = [];
  assert.equal(warehouseFormState(x).ready, true);
});
test("unverified packaging and fractional, negative or oversized quantities require correction", () => {
  for (const qty of ["-1", "1.2", "1000000001", ""]) {
    const x = base();
    x.form.eaches = qty;
    assert.equal(warehouseFormState(x).ready, false);
  }
  const x = base();
  x.form.units_per_case = "10";
  assert.equal(warehouseFormState(x).ready, false);
  x.form.pack_confirmed = true;
  assert.equal(warehouseFormState(x).ready, true);
});
test("zero is allowed for a count but not a receipt, and picking requires a physical lot and tracked container", () => {
  let x = base();
  x.form.cases = "0";
  x.form.eaches = "0";
  x.form.units_per_case = "";
  assert.equal(warehouseFormState(x).ready, true);
  x.mode = "receive";
  x.form.po_id = "po";
  assert.equal(warehouseFormState(x).ready, false);
  x = base();
  x.mode = "pick";
  Object.assign(x.form, {
    raw_barcode: "SKU",
    order_id: "order",
    order_item_id: "line",
  });
  x.containers = [{ lot_id: "lot" }];
  assert.equal(warehouseFormState(x).ready, false);
  x.form.container_id = "case";
  assert.equal(warehouseFormState(x).ready, true);
  x.form.lot_id = "";
  assert.equal(warehouseFormState(x).ready, false);
});
