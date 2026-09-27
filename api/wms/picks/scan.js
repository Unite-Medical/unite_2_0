import { atomicTransition } from "../../_lib/atomicTransition.js";
import {
  resolveSpatialBarcode,
  quantityFrom,
} from "../../_lib/warehouseMobile.js";
import { handleWmsRoute } from "../../_lib/wms.js";
import { planPickScan } from "../../_lib/pickScanning.js";
import {
  buildBarcodeRegistry,
  resolveBarcode,
} from "../../../src/lib/barcodeRegistry.js";
import catalog from "../../../src/data/shopifyLaunchCatalog.generated.json" with { type: "json" };

const registry = buildBarcodeRegistry(catalog.products);
export default function handler(req, res) {
  return handleWmsRoute(req, res, async (sql, body, session) => {
    if (
      !session ||
      !["admin", "warehouse_manager", "warehouse_operator"].includes(
        session.role,
      )
    )
      return { ok: false, reason: "picker_session_required" };
    const orderId = String(body.order_id || ""),
      itemId = String(body.order_item_id || "");
    const [orderRows, itemRows, reservationRows, lotRows, scanRows] =
      await Promise.all([
        sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${orderId} AND deleted=false LIMIT 1`,
        sql`SELECT data FROM um_rows WHERE tbl='order_items' AND id=${itemId} AND deleted=false LIMIT 1`,
        sql`SELECT data FROM um_rows WHERE tbl='reservations' AND deleted=false AND data->>'order_id'=${orderId}`,
        sql`SELECT data FROM um_rows WHERE tbl='lots' AND deleted=false`,
        sql`SELECT data FROM um_rows WHERE tbl='scan_events' AND deleted=false AND data->>'order_id'=${orderId} AND data->>'kind'='pick_verify'`,
      ]);
    const productRows =
      await sql`SELECT data FROM um_rows WHERE tbl='products' AND deleted=false`;
    const variantRows =
      await sql`SELECT data FROM um_rows WHERE tbl='product_variants' AND deleted=false`;
    const containerRows =
      await sql`SELECT data FROM um_rows WHERE tbl='warehouse_containers' AND deleted=false`;
    const mobile = resolveSpatialBarcode(
      body.barcode,
      productRows.map((r) => r.data),
      variantRows.map((r) => r.data),
      containerRows.map((r) => r.data),
      lotRows.map((r) => r.data),
    );
    let resolution = resolveBarcode(registry, body.barcode);
    let pickBody = body;
    if (body.action === "pick") {
      if (!mobile.ok) return { ok: false, reason: mobile.reason };
      if (mobile.container && mobile.container.id !== body.container_id)
        return { ok: false, reason: "scanned_container_does_not_match" };
      if (body.confirmed !== true)
        return { ok: false, reason: "physical_confirmation_required" };
      const q = quantityFrom(body, mobile.product);
      if (!q.ok || q.units < 1)
        return { ok: false, reason: q.reason || "positive_pick_required" };
      resolution = {
        ok: true,
        sku: mobile.product.sku,
        units_per_scan: 1,
        variant_id: mobile.product.id,
      };
      pickBody = { ...body, scan_count: q.units };
    }
    const plan = planPickScan({
      order: orderRows[0]?.data,
      item: itemRows[0]?.data,
      reservations: reservationRows.map((r) => r.data),
      lots: lotRows.map((r) => r.data),
      existingScans: scanRows.map((r) => r.data),
      barcodeResolution: resolution,
      body: pickBody,
      actorId: session.user_id,
    });
    if (!plan.ok) return plan;
    if (plan.idempotent) return plan;
    const order = orderRows[0].data;
    const writes = [
      {
        table: "orders",
        before: order,
        data: { ...order, pick_revision: Number(order.pick_revision || 0) + 1 },
      },
      { table: "scan_events", before: null, data: plan.event },
    ];
    const checks = [
      { table: "orders", id: order.id, before: order },
      {
        table: "order_items",
        id: itemRows[0].data.id,
        before: itemRows[0].data,
      },
      ...reservationRows.map((r) => ({
        table: "reservations",
        id: r.data.id,
        before: r.data,
      })),
      ...lotRows
        .filter((r) => r.data.id === plan.event.lot_id)
        .map((r) => ({ table: "lots", id: r.data.id, before: r.data })),
    ];
    const physicalLot = lotRows.find(
      (r) => r.data.id === plan.event.lot_id,
    )?.data;
    if (physicalLot) {
      const otherPicks =
        await sql`SELECT s.data FROM um_rows s JOIN um_rows o ON o.tbl='orders' AND o.id=s.data->>'order_id' AND o.deleted=false WHERE s.tbl='scan_events' AND s.deleted=false AND s.data->>'kind'='pick_verify' AND s.data->>'status'='verified' AND s.data->>'lot_id'=${physicalLot.id} AND o.data->>'status' IN ('inventory_reserved','ready_to_ship','ready_for_pickup')`;
      const picked = otherPicks.reduce(
        (n, r) => n + Number(r.data.units_verified || 0),
        0,
      );
      if (
        picked + plan.event.units_verified >
        Number(physicalLot.qty_remaining)
      )
        return { ok: false, reason: "lot_already_picked_for_other_orders" };
      writes.push({
        table: "lots",
        before: physicalLot,
        data: {
          ...physicalLot,
          pick_revision: Number(physicalLot.pick_revision || 0) + 1,
        },
      });
    }
    const tracked =
      await sql`SELECT data FROM um_rows WHERE tbl='warehouse_containers' AND deleted=false AND data->>'lot_id'=${String(plan.event.lot_id || "")}`;
    if (tracked.length && !body.container_id)
      return { ok: false, reason: "source_container_required" };
    if (body.container_id) {
      const box = tracked.find((r) => r.data.id === body.container_id)?.data;
      if (
        !box ||
        box.needs_recount ||
        box.sku !== plan.event.sku ||
        box.bin_id !== body.bin_id ||
        Number(box.units_remaining) < plan.event.units_verified
      )
        return {
          ok: false,
          reason: "container_requires_recount_or_has_insufficient_units",
        };
      const remaining = Number(box.units_remaining) - plan.event.units_verified;
      if (box.state === "sealed" && remaining > 0)
        return { ok: false, reason: "open_case_before_picking_eaches" };
      writes.push({
        table: "warehouse_containers",
        before: box,
        data: {
          ...box,
          units_remaining: remaining,
          units_picked:
            Number(box.units_picked || 0) + plan.event.units_verified,
          updated_by: session.user_id,
          updated_at: plan.event.scanned_at,
        },
      });
      plan.event.container_id = box.id;
    }
    const saved = await atomicTransition(sql, { checks, writes });
    if (!saved.ok) return saved;

    return {
      ok: true,
      idempotent: false,
      event: plan.event,
      line_complete: plan.complete,
      on_hand_changed: false,
    };
  });
}
