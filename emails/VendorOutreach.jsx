import React from 'react';
import { Layout } from './Layout.jsx';
import { H1, Lead, Para, CTA, DataRows } from './ui.jsx';

export function VendorOutreach({
  contactName = 'Mr. Okafor',
  category = 'Class II surgical instruments',
  rep = 'Damon',
} = {}) {
  return (
    <Layout
      preview={`Unite Medical — sourcing inquiry for ${category}`}
      eyebrow="Sourcing Inquiry"
      footerNote="Unite Medical is an FDA-registered, veteran-owned wholesale distributor based in Lithia Springs, GA."
    >
      <H1>Exploring a supply partnership</H1>
      <Lead>
        Hello {contactName} — I&apos;m reaching out from <strong>Unite Medical</strong>. We source,
        stock, and ship medical devices for surgery centers, pharmacies, health systems, and
        government buyers, and we&apos;re actively expanding our line of <strong>{category}</strong>.
      </Lead>

      <Para>
        We own and warehouse everything we sell across two US facilities, which lets us commit to
        consistent volume and clean, on-time payment. A few things we&apos;d want to align on:
      </Para>

      <DataRows
        rows={[
          { label: 'Category', value: category },
          { label: 'Initial volume', value: 'Pilot PO, then standing orders' },
          { label: 'Payment', value: 'Net-30, scaling to deposit + balance' },
          { label: 'Compliance', value: 'FDA reg., GTIN/UDI, CoC on file' },
        ]}
      />

      <Para>
        If this looks like a fit, I&apos;d welcome a short call to share our forecast and the
        documentation we&apos;ll need to get a first PO moving.
      </Para>

      <CTA href="https://unitemedical.net/contact">Book 15 minutes</CTA>

      <Para>
        Best regards,<br />
        {rep}<br />
        Unite Medical · Sourcing
      </Para>
    </Layout>
  );
}

export default VendorOutreach;
