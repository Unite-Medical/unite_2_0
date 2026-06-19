import React from 'react';
import { Layout } from './Layout.jsx';
import { H1, Lead, CTA, DataRows } from './ui.jsx';

export function ShippingUpdate({
  buyerName = 'Maria',
  orderId = 'UM-48201',
  carrier = 'UPS',
  tracking = '1Z 999 AA1 01 2345 6784',
  trackingUrl = 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
  eta = 'Tomorrow, June 20 by 4:30 PM',
  warehouse = 'Lithia Springs, GA',
} = {}) {
  return (
    <Layout
      preview={`Order ${orderId} has shipped — ${carrier} ${tracking}`}
      eyebrow={`Shipment · ${orderId}`}
      footerNote="Heads up: signature isn't required. Track anytime with the link above."
    >
      <H1>It&apos;s on the way, {buyerName}.</H1>
      <Lead>
        Order <strong>{orderId}</strong> left our {warehouse} warehouse and is in transit with{' '}
        {carrier}.
      </Lead>

      <DataRows
        rows={[
          { label: 'Carrier', value: carrier },
          { label: 'Tracking number', value: tracking },
          { label: 'Estimated delivery', value: eta, strong: true },
        ]}
      />

      <CTA href={trackingUrl}>Track shipment</CTA>
    </Layout>
  );
}

export default ShippingUpdate;
