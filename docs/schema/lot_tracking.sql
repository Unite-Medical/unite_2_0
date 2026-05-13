-- =============================================================
-- Unite Medical · Lot-Level Tracking schema
-- Source: Unite_CTO_Site_Document.md §7
-- Status: canonical schema; backend implementation pending
-- =============================================================
--
-- The /compliance page promises "lot-level traceability for recall
-- management" with a 1-business-day SLA. This schema is the data model
-- that promise depends on. Every scanned item-on-an-order must end up
-- in `lot_tracking` so that the recall query in §7.3 can return every
-- affected customer within minutes of a recall notification.

CREATE TABLE IF NOT EXISTS lot_tracking (
    id                  SERIAL PRIMARY KEY,
    order_id            INTEGER NOT NULL REFERENCES orders(id),
    order_line_item_id  INTEGER,                 -- denormalized for fast joins
    product_id          INTEGER NOT NULL REFERENCES products(id),
    lot_number          VARCHAR(100) NOT NULL,
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    expiration_date     DATE,
    scanned_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    scanned_by          VARCHAR(100)             -- WMS user id or station id
);

-- Recall queries pivot on lot_number; add a covering index that also
-- supports the (product, lot) two-column lookups recall investigators run.
CREATE INDEX IF NOT EXISTS idx_lot_tracking_lot ON lot_tracking(lot_number);
CREATE INDEX IF NOT EXISTS idx_lot_tracking_product_lot
    ON lot_tracking(product_id, lot_number);

-- =============================================================
-- Canonical recall query — given a recalled lot, list every customer
-- who received units, with order id, quantity, and ship date. This is
-- the query the recall-notification job runs to build its mailing list.
-- =============================================================
--
-- SELECT DISTINCT
--     o.customer_id,
--     o.id           AS order_id,
--     lt.lot_number,
--     lt.quantity,
--     lt.scanned_at  AS ship_date
-- FROM lot_tracking lt
-- JOIN orders o ON lt.order_id = o.id
-- WHERE lt.lot_number = $1
-- ORDER BY lt.scanned_at DESC;
