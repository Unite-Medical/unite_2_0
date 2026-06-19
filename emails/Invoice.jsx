import React from 'react';
import { Layout } from './Layout.jsx';
import { H1, Lead, Para, CTA, DataRows } from './ui.jsx';

export function Invoice({
  buyerName = 'Maria',
  invoiceId = 'INV-20418',
  orderId = 'UM-48201',
  amount = 487.0,
  terms = 'Net-30',
  dueDate = 'July 12, 2026',
  daysUntilDue = 6,
} = {}) {
  const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Layout
      preview={`Invoice ${invoiceId} — ${money(amount)} due ${dueDate}`}
      eyebrow={`Invoice · ${invoiceId}`}
      footerNote="Questions on this invoice? Reply here or reach Accounts Receivable at ar@unitemedical.net."
    >
      <H1>Invoice {invoiceId}</H1>
      <Lead>
        Hi {buyerName} — here&apos;s the invoice for order <strong>{orderId}</strong>. It&apos;s
        due in <strong>{daysUntilDue} days</strong> under your {terms} terms.
      </Lead>

      <DataRows
        rows={[
          { label: 'Invoice number', value: invoiceId },
          { label: 'Order', value: orderId },
          { label: 'Terms', value: terms },
          { label: 'Due date', value: dueDate },
          { label: 'Amount due', value: money(amount), strong: true },
        ]}
      />

      <Para>
        Remit via ACH on the account on file, or pay securely online. If anything on the invoice
        needs correcting, just reply and we&apos;ll turn it around the same day.
      </Para>

      <CTA href={`https://unitemedical.net/account/invoices/${invoiceId}`}>Pay invoice</CTA>
    </Layout>
  );
}

export default Invoice;
