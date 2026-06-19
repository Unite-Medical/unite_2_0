import React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { C, FONTS } from './theme.js';

export function H1({ children }) {
  return <Heading style={h1}>{children}</Heading>;
}

export function Lead({ children }) {
  return <Text style={lead}>{children}</Text>;
}

export function Para({ children }) {
  return <Text style={para}>{children}</Text>;
}

export function CTA({ href, children }) {
  return (
    <Section style={{ padding: '8px 0 20px' }}>
      <Button href={href} style={cta}>{children}</Button>
    </Section>
  );
}

/** Key/value summary block (order totals, invoice meta, etc.). */
export function DataRows({ rows }) {
  return (
    <table cellPadding={0} cellSpacing={0} width="100%" role="presentation" style={{ margin: '4px 0 20px' }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ ...dataLabel, ...(r.strong ? strongCell : {}) }}>{r.label}</td>
            <td style={{ ...dataValue, ...(r.strong ? strongCell : {}) }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Line-item table for orders / quotes / POs. */
export function LineItems({ items, currency = '$' }) {
  return (
    <table cellPadding={0} cellSpacing={0} width="100%" role="presentation" style={lineTable}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: 'left' }}>Item</th>
          <th style={{ ...th, textAlign: 'center', width: '52px' }}>Qty</th>
          <th style={{ ...th, textAlign: 'right', width: '92px' }}>Price</th>
          <th style={{ ...th, textAlign: 'right', width: '96px' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i}>
            <td style={tdItem}>
              <span style={{ display: 'block', color: C.ink, fontWeight: 600 }}>{it.name}</span>
              {it.sku ? <span style={skuText}>{it.sku}</span> : null}
            </td>
            <td style={{ ...td, textAlign: 'center' }}>{it.qty}</td>
            <td style={{ ...td, textAlign: 'right' }}>{currency}{fmt(it.price)}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: C.ink }}>{currency}{fmt(it.qty * it.price)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const h1 = {
  fontFamily: FONTS.display,
  fontSize: '30px',
  fontWeight: 400,
  lineHeight: '1.15',
  letterSpacing: '-0.02em',
  color: C.ink,
  margin: '0 0 14px',
};

const lead = {
  fontFamily: FONTS.sans,
  fontSize: '16px',
  lineHeight: '1.55',
  color: C.ink2,
  margin: '0 0 20px',
};

const para = {
  fontFamily: FONTS.sans,
  fontSize: '15px',
  lineHeight: '1.6',
  color: C.ink2,
  margin: '0 0 16px',
};

const cta = {
  backgroundColor: C.plum,
  color: C.paper,
  fontFamily: FONTS.sans,
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '14px 28px',
  borderRadius: '999px',
  display: 'inline-block',
};

const lineTable = {
  borderCollapse: 'collapse',
  margin: '8px 0 4px',
};

const th = {
  fontFamily: FONTS.mono,
  fontSize: '10px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: C.ink3,
  padding: '0 0 8px',
  borderBottom: `1px solid ${C.line}`,
};

const td = {
  fontFamily: FONTS.sans,
  fontSize: '14px',
  color: C.ink2,
  padding: '12px 0',
  borderBottom: `1px solid ${C.line}`,
  verticalAlign: 'top',
};

const tdItem = {
  ...td,
  paddingRight: '12px',
};

const skuText = {
  display: 'block',
  fontFamily: FONTS.mono,
  fontSize: '11px',
  color: C.ink3,
  marginTop: '3px',
};

const dataLabel = {
  fontFamily: FONTS.sans,
  fontSize: '14px',
  color: C.ink2,
  padding: '7px 0',
  textAlign: 'left',
};

const dataValue = {
  fontFamily: FONTS.sans,
  fontSize: '14px',
  color: C.ink,
  fontWeight: 600,
  padding: '7px 0',
  textAlign: 'right',
};

const strongCell = {
  fontSize: '17px',
  color: C.ink,
  fontWeight: 700,
  borderTop: `1px solid ${C.line}`,
  paddingTop: '12px',
};
