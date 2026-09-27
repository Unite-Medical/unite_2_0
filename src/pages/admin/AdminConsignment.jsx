import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { consignment } from '../../lib/consignment.js';
import { shippingRates } from '../../lib/shippingRates.js';

// Load-time timestamp for near-expiry checks; render must stay pure.
const PAGE_LOADED_AT = Date.now();

// PRD-27 §9 — admin consignment console: per-distributor stock, scan-event
// audit, markup overrides, settlement.
export function AdminConsignment() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const orgs = db.useTable('organizations');
  const distProducts = db.useTable('distributor_products');
  const distributorIds = [...new Set(distProducts.map((p) => p.owner_org_id))];
  const distributors = orgs.filter((o) => distributorIds.includes(o.id));
  const [activeId, setActiveId] = useState(distributors[0]?.id);
  const active = distributors.find((d) => d.id === activeId) || distributors[0];

  db.useTable('inventory_lots');
  db.useTable('consignment_movements');
  db.useTable('purchase_orders');
  const markupRows = db.useTable('shipping_markup_config');
  const globalMarkup = markupRows.find((r) => r.scope === 'global')?.markup_pct ?? 10;

  // useTable subscriptions above rerender this component on any relevant
  // table change, so recomputing inline stays fresh without memo deps.
  const inventory = active ? consignment.inventoryFor(active.id) : [];
  const metrics = new Map((active ? consignment.metricsFor(active.id) : []).map((row) => [row.product_id, row]));
  const settlement = active ? consignment.settlementFor(active.id) : { movements: [], owed: 0, settled: 0, units: 0 };
  const scans = active ? db.list('scan_events').filter((s) => {
    const lot = s.inventory_lot_id ? db.get('inventory_lots', s.inventory_lot_id) : null;
    return lot?.owner_org_id === active.id;
  }).slice(-10).reverse() : [];
  const overridePct = active ? markupRows.find((r) => r.scope === 'distributor' && r.owner_org_id === active.id)?.markup_pct : null;
  const soon = (d) => d && (new Date(d) - PAGE_LOADED_AT) < 60 * 86400000;

  return (
    <AdminShell active="consignment">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px 24px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>WAREHOUSE · 3PL CONSIGNMENT</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Consignment</h1>
        <p style={{ color: D.ink2, marginTop: 10, maxWidth: 680 }}>Distributor-owned stock stored in the Unite warehouse — tracked separately from Unite&apos;s, never commingled. Sell-through draws down the owner&apos;s lots for settlement.</p>
      </div>

      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gap: 20 }}>
        <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 10 }}>SHIPPING MARKUP</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: D.ink2, display: 'flex', alignItems: 'center', gap: 8 }}>
              Global default
              <input type="number" defaultValue={globalMarkup} onBlur={(e) => shippingRates.setMarkup({ scope: 'global', markup_pct: e.target.value, updated_by: 'usr_admin' })} style={inp} />%
            </label>
            {active && (
              <label style={{ fontSize: 13, color: D.ink2, display: 'flex', alignItems: 'center', gap: 8 }}>
                {active.name} override
                <input type="number" defaultValue={overridePct ?? ''} placeholder={String(globalMarkup)} onBlur={(e) => e.target.value !== '' && shippingRates.setMarkup({ scope: 'distributor', owner_org_id: active.id, markup_pct: e.target.value, updated_by: 'usr_admin' })} style={inp} />%
              </label>
            )}
            <div style={{ fontSize: 12, color: D.ink3 }}>e.g. $9.00 carrier cost → {fmt.money(shippingRates.applyMarkup(9, active?.id))} Unite rate</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '240px 1fr', gap: 20 }}>
          <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden', height: 'fit-content' }}>
            {distributors.map((d) => (
              <button key={d.id} onClick={() => setActiveId(d.id)} style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderTop: `1px solid ${D.line}`, background: active?.id === d.id ? 'rgba(29,92,77,.06)' : 'transparent', cursor: 'pointer', color: D.ink }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: D.ink2 }}>{consignment.productsFor(d.id).length} SKUs</div>
              </button>
            ))}
            {distributors.length === 0 && <div style={{ padding: 16, color: D.ink3, fontSize: 13 }}>No consignment distributors yet.</div>}
          </div>

          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12 }}>
              {[[String(inventory.reduce((a, b) => a + b.on_hand, 0)), 'Units on hand'], [String(inventory.length), 'Consignment SKUs'], [fmt.money(settlement.owed), 'Owed (sell-through)'], [String(settlement.units), 'Units sold']].map(([b, s]) => (
                <div key={s} style={{ padding: 16, background: D.card, border: `1px solid ${D.line}`, borderRadius: 10 }}>
                  <div style={{ fontFamily: D.display, fontSize: 22 }}>{b}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 4 }}>{s.toUpperCase()}</div>
                </div>
              ))}
            </div>

            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', fontFamily: D.display, fontSize: 18, borderBottom: `1px solid ${D.line}` }}>Inventory</div>
              <div className="um-scroll-x">
                <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['SKU', 'NAME', 'ON HAND', 'RUN RATE', 'AGREED COST', 'PRICE VALID UNTIL', 'LOW AT', 'NEAREST EXPIRY'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {inventory.map((product) => {
                      const metric = metrics.get(product.id) || {};
                      return (
                        <tr key={product.id} style={{ borderTop: `1px solid ${D.line}` }}>
                          <td style={{ padding: '10px 12px', fontFamily: D.mono, color: D.plum }}>{product.distributor_sku}{product.mapped_unite_sku ? ` → ${product.mapped_unite_sku}` : ''}</td>
                          <td style={{ padding: '10px 12px', color: D.ink2 }}>{product.name}</td>
                          <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{product.on_hand}<div style={{ color: D.ink3, fontSize: 10 }}>{product.available} available</div></td>
                          <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{metric.run_rate ?? 0}/day<div style={{ color: D.ink3, fontSize: 10 }}>{metric.days_cover ?? '—'} days cover</div></td>
                          <td style={{ padding: '10px 12px' }}>
                            <input type="number" min="0" step="0.0001" defaultValue={product.settlement_unit_cost ?? ''} onBlur={(event) => db.update('distributor_products', product.id, {
                              settlement_unit_cost: Number(event.target.value) || null,
                              settlement_currency: product.settlement_currency || 'USD',
                              settlement_effective_from: product.settlement_effective_from || new Date().toISOString(),
                              settlement_updated_by: 'usr_admin', settlement_updated_at: new Date().toISOString(),
                            })} style={{ ...inp, width: 95 }} />
                          </td>
                          <td style={{ padding: '10px 12px' }}><input type="date" defaultValue={product.settlement_effective_until?.slice(0, 10) || ''} onBlur={(event) => db.update('distributor_products', product.id, { settlement_effective_until: event.target.value ? `${event.target.value}T23:59:59.999Z` : null })} style={{ ...inp, width: 135 }} /></td>
                          <td style={{ padding: '10px 12px' }}><input type="number" min="0" defaultValue={product.low_stock_threshold ?? ''} onBlur={(event) => db.update('distributor_products', product.id, { low_stock_threshold: Number(event.target.value) || 0 })} style={inp} /></td>
                          <td style={{ padding: '10px 12px', color: soon(product.nearest_expiry) ? D.terra : D.ink2 }}>{product.nearest_expiry || '—'}{soon(product.nearest_expiry) ? ' ⚠' : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18 }}>
              <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontFamily: D.display, fontSize: 18 }}>Settlement POs</div>
                <div style={{ marginTop: 8, fontSize: 13, color: D.ink2 }}>Open <b style={{ color: D.ink }}>{fmt.money(settlement.owed)}</b> · settled {fmt.money(settlement.settled)}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: D.ink3 }}>Sell-through creates a draft supplier PO. Settlement closes only from approved QBO bill/payment evidence, never from a manual toggle.</div>
                {settlement.movements.slice(-5).reverse().map((movement) => (
                  <div key={movement.id} style={{ fontSize: 12, color: D.ink3, marginTop: 7, fontFamily: D.mono }}>{movement.settlement_po_id || 'PO pending'} · {movement.qty}u · {fmt.money((movement.unit_cost || 0) * movement.qty)} {movement.settled ? '✓' : 'open'}</div>
                ))}
              </div>
              <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontFamily: D.display, fontSize: 18 }}>Scan audit</div>
                <div style={{ fontSize: 12, color: D.ink3, marginTop: 4 }}>Receive/pick provenance — zero-manual-entry proof.</div>
                {scans.length === 0 && <div style={{ fontSize: 12, color: D.ink3, marginTop: 10 }}>No scans recorded.</div>}
                {scans.map((s) => (
                  <div key={s.id} style={{ fontSize: 12, color: s.capture_method === 'manual' ? D.terra : D.ink2, marginTop: 6, fontFamily: D.mono }}>{s.kind} · {s.capture_method} · {s.parsed?.lot || '—'}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

const inp = { width: 70, padding: '7px 9px', border: `1px solid ${D.line}`, borderRadius: 6, fontFamily: 'inherit', fontSize: 13 };
