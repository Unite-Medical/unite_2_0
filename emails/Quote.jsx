import React from 'react';
import { Layout } from './Layout.jsx';
import { H1, Lead, Para, CTA, DataRows, LineItems } from './ui.jsx';

export function Quote({
  buyerName = 'Dr. Ellison',
  quoteId = 'Q-30912',
  org = 'Northside Pharmacy Group',
  items = [
    { name: 'Sterile Gauze Sponges 4x4 (200/tray)', sku: 'GZE-4X4-200', qty: 60, price: 6.95 },
    { name: 'Povidone-Iodine Swabsticks (50/box)', sku: 'PVI-SWB-50', qty: 30, price: 4.5 },
    { name: 'IV Start Kits, Sterile', sku: 'IVK-STD', qty: 100, price: 2.85 },
  ],
  validUntil = 'July 3, 2026',
} = {}) {
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Layout
      preview={`Quote ${quoteId} for ${org} — valid through ${validUntil}`}
      eyebrow={`Quote · ${quoteId}`}
      footerNote="Landed cost, transparent. No minimums on stocked items. Need volume pricing? Just reply."
    >
      <H1>Your quote is ready, {buyerName}.</H1>
      <Lead>
        Here&apos;s pricing for <strong>{org}</strong>. This quote is locked through{' '}
        <strong>{validUntil}</strong> — accept any time before then to hold these rates.
      </Lead>

      <LineItems items={items} />

      <DataRows
        rows={[
          { label: 'Estimated subtotal', value: money(subtotal), strong: true },
        ]}
      />

      <Para>
        Pricing reflects current stock at our Georgia &amp; Nevada warehouses. Freight is quoted
        separately on request, and Net-30 terms are available on approved accounts.
      </Para>

      <CTA href={`https://unitemedical.net/quote/${quoteId}`}>Review &amp; accept quote</CTA>
    </Layout>
  );
}

export default Quote;
