export const EVIDENCE_SOURCES = ['qbo_pos', 'qbo_items', 'qbo_bills', 'qbo_purchases', 'qbo_vendor_credits', 'shopify_inventory', 'shopify_open_orders', 'shopify_recent_orders', 'shipstation_orders', 'shipstation_shipments', 'shipstation_awaiting_payment', 'shipstation_awaiting_shipment', 'shipstation_on_hold', 'unite_inventory'];
export async function collectEvidence(sources, since, { request, progress = () => {}, maxPages = 1000 }) {
  const bundle = { version: 1, started_at: new Date().toISOString(), since, datasets: {}, warning: 'Provisional evidence, not a physical stock count. Sources change during export; compare timestamps. Do not add POs to stock or subtract open orders twice.' };
  for (const source of sources) {
    const dataset = { complete: false, pages: [], errors: [] }; bundle.datasets[source] = dataset;
    let cursor = null; const seen = new Set();
    try {
      for (let page = 1; page <= maxPages; page++) {
        progress(`${source.replaceAll('_', ' ')} · page ${page}`);
        const result = await request({ source, since, page, cursor });
        if (!Array.isArray(result.records) || typeof result.has_more !== 'boolean') throw new Error('Invalid source page');
        dataset.pages.push(result);
        if (!result.has_more) { dataset.complete = !dataset.pages.some(p => p.warnings?.length); break; }
        if (source.startsWith('shopify_') && (!result.next_cursor || seen.has(result.next_cursor))) throw new Error('Pagination stalled');
        cursor = result.next_cursor || null; if (cursor) seen.add(cursor);
        if (page === maxPages) throw new Error('Page limit reached; export incomplete');
      }
    } catch (error) { dataset.errors.push(error.message); }
  }
  bundle.finished_at = new Date().toISOString(); return bundle;
}
