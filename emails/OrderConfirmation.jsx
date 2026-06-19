import React from 'react';
import { Layout } from './Layout.jsx';
import { H1, Lead, CTA, DataRows, LineItems } from './ui.jsx';

export function OrderConfirmation({
  buyerName = 'Maria',
  orderId = 'UM-48201',
  items = [
    { name: 'Nitrile Exam Gloves, Powder-Free (M)', sku: 'GLV-NIT-M', qty: 40, price: 8.75 },
    { name: 'Alcohol Prep Pads, Sterile (200/box)', sku: 'PRP-ALC-200', qty: 25, price: 3.4 },
    { name: '3mL Luer-Lock Syringes (100/box)', sku: 'SYR-LL-3', qty: 12, price: 11.2 },
  ],
  shipTo = 'Peachtree Surgery Center · Atlanta, GA 30309',
} = {}) {
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const shipping = 0;
  const total = subtotal + shipping;
  const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Layout
      preview={`Order ${orderId} confirmed — ships today from Lithia Springs, GA`}
      eyebrow={`Order Confirmation · ${orderId}`}
      footerNote="Orders placed before 2:00 PM EST ship same day from our Georgia & Nevada warehouses."
    >
      <H1>Thanks, {buyerName} — your order is confirmed.</H1>
      <Lead>
        We&apos;ve received order <strong>{orderId}</strong> and it&apos;s queued for same-day
        shipping. You&apos;ll get tracking the moment it leaves the dock.
      </Lead>

      <LineItems items={items} />

      <DataRows
        rows={[
          { label: 'Subtotal', value: money(subtotal) },
          { label: 'Shipping (same-day, ground)', value: shipping === 0 ? 'FREE' : money(shipping) },
          { label: 'Total', value: money(total), strong: true },
        ]}
      />

      <DataRows
        rows={[
          { label: 'Ship to', value: shipTo },
          { label: 'Terms', value: 'Net-30' },
        ]}
      />

      <CTA href={`https://unitemedical.net/account/orders/${orderId}`}>View order</CTA>
    </Layout>
  );
}

export default OrderConfirmation;
