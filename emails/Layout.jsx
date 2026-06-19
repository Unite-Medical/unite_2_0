import React from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { C, FONTS, COMPANY } from './theme.js';

/**
 * Branded shell for every Unite Medical transactional email.
 *
 * - Warm paper background, plum brand band, "UM" monogram, Fraunces eyebrow.
 * - Plum footer with credentials + contact, matching src/components/layout/Footer.jsx.
 * The monogram is rendered as a styled table cell (not an <img>) so it survives
 * clients that strip remote images.
 */
export function Layout({ preview, eyebrow, children, footerNote }) {
  return (
    <Html lang="en">
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={body}>
        <Container style={container}>
          {/* Header band */}
          <Section style={header}>
            <table cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  <td style={mark}>UM</td>
                  <td style={{ paddingLeft: 12 }}>
                    <span style={wordmark}>
                      Unite <span style={{ color: C.plumSoft, fontWeight: 500 }}>Medical</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Body card */}
          <Section style={card}>
            {eyebrow ? <Text style={eyebrowText}>{eyebrow}</Text> : null}
            {children}
          </Section>

          {/* Footer */}
          <Section style={footer}>
            {footerNote ? <Text style={footerNoteText}>{footerNote}</Text> : null}
            <Text style={footerCompany}>{COMPANY.legal}</Text>
            <Text style={footerLine}>
              {COMPANY.address}
            </Text>
            <Text style={footerLine}>
              <Link href={COMPANY.phoneHref} style={footerLink}>{COMPANY.phone}</Link>
              {'  ·  '}
              <Link href={COMPANY.site} style={footerLink}>unitemedical.net</Link>
            </Text>
            <Hr style={footerRule} />
            <Text style={credentials}>{COMPANY.credentials}</Text>
            <Text style={legal}>
              © 2026 {COMPANY.legal}. This message was sent to you regarding your account
              or order with Unite Medical.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: C.paperAlt,
  fontFamily: FONTS.sans,
  margin: 0,
  padding: '24px 0',
};

const container = {
  width: '600px',
  maxWidth: '100%',
  margin: '0 auto',
};

const header = {
  backgroundColor: C.paper,
  padding: '24px 32px',
  borderRadius: '16px 16px 0 0',
  borderBottom: `1px solid ${C.line}`,
};

const mark = {
  width: '34px',
  height: '34px',
  backgroundColor: C.plum,
  borderRadius: '8px',
  color: C.white,
  fontFamily: FONTS.sans,
  fontWeight: 700,
  fontSize: '14px',
  letterSpacing: '0.5px',
  textAlign: 'center',
  verticalAlign: 'middle',
};

const wordmark = {
  fontFamily: FONTS.sans,
  fontSize: '17px',
  fontWeight: 700,
  color: C.ink,
  letterSpacing: '-0.2px',
};

const card = {
  backgroundColor: C.card,
  padding: '36px 32px 8px',
};

const eyebrowText = {
  fontFamily: FONTS.mono,
  fontSize: '11px',
  letterSpacing: '1.4px',
  textTransform: 'uppercase',
  color: C.plum,
  margin: '0 0 16px',
};

const footer = {
  backgroundColor: C.plum,
  padding: '28px 32px 32px',
  borderRadius: '0 0 16px 16px',
};

const footerNoteText = {
  fontFamily: FONTS.sans,
  fontSize: '13px',
  lineHeight: '1.6',
  color: C.plumSoft,
  margin: '0 0 18px',
};

const footerCompany = {
  fontFamily: FONTS.display,
  fontSize: '18px',
  color: C.paper,
  margin: '0 0 6px',
};

const footerLine = {
  fontFamily: FONTS.sans,
  fontSize: '13px',
  color: C.plumSoft,
  margin: '0 0 2px',
};

const footerLink = {
  color: C.paper,
  textDecoration: 'none',
};

const footerRule = {
  borderColor: 'rgba(247,242,234,0.18)',
  margin: '18px 0 14px',
};

const credentials = {
  fontFamily: FONTS.mono,
  fontSize: '10.5px',
  letterSpacing: '1px',
  color: C.plumSoft,
  margin: '0 0 10px',
};

const legal = {
  fontFamily: FONTS.sans,
  fontSize: '11px',
  lineHeight: '1.5',
  color: 'rgba(247,242,234,0.55)',
  margin: 0,
};
