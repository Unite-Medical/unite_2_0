import { D } from '../../tokens.js';
import { Nav } from '../../components/layout/Nav.jsx';
import { Footer } from '../../components/layout/Footer.jsx';
import { PageHead } from '../../components/layout/PageHead.jsx';
import { Grad } from '../../components/shared/Grad.jsx';
import { useViewport } from '../../lib/viewport.js';
import { useSEO } from '../../lib/seo.js';

/** Shared layout for short-form legal/policy pages. */
export function LegalShell({ eyebrow, title, lastUpdated, sections }) {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead eyebrow={eyebrow} title={title} sub={lastUpdated ? `Last updated ${lastUpdated}.` : undefined} />
        <section style={{ padding: `32px ${padX}px ${isMobile ? 56 : 96}px` }}>
          <div style={{ maxWidth: 880, margin: '0 auto' }}>
            {sections.map((s, i) => (
              <div key={s.title} style={{ marginTop: i === 0 ? 0 : 40 }}>
                <h2 style={{ fontFamily: D.display, fontSize: 28, fontWeight: 400, letterSpacing: -0.5, margin: 0, lineHeight: 1.2 }}>{s.title}</h2>
                {(Array.isArray(s.body) ? s.body : [s.body]).map((p, idx) => (
                  <p key={idx} style={{ fontSize: 15.5, lineHeight: 1.7, color: D.ink2, marginTop: 14 }}>{p}</p>
                ))}
                {s.list && (
                  <ul style={{ marginTop: 14, paddingLeft: 22, color: D.ink2, fontSize: 15.5, lineHeight: 1.7 }}>
                    {s.list.map((li) => <li key={li} style={{ marginTop: 6 }}>{li}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export function Privacy() {
  useSEO({
    title: 'Privacy Policy',
    description: 'How Unite Medical collects, uses, stores, and shares your information. Hosted in SOC 2 Type II data centers. No PHI without a signed BAA.',
    canonical: '/privacy',
  });
  return (
    <LegalShell
      eyebrow="LEGAL · PRIVACY"
      title={<>Your data. <Grad>Your rules.</Grad></>}
      lastUpdated="April 2026"
      sections={[
        { title: 'What we collect', body: 'Account information you give us (name, work email, organization, address), the orders and quotes you create, and basic device telemetry. We do not collect protected health information (PHI) without a signed Business Associate Agreement.' },
        { title: 'Why we collect it', body: 'To process your orders, generate invoices, ship goods, support compliance audits, and improve the platform. We do not sell your data to third parties — full stop.' },
        // [CONFIRM pending, PRD-29 §7.2] SOC 2 applies to the hosting provider,
        // not Unite itself — worded accordingly until verified otherwise.
        { title: 'Where it lives', body: 'Customer records and order history are hosted in SOC 2 Type II data centers in the United States. Backups are encrypted at rest.' },
        { title: 'Sharing', body: 'We share order, payment, and shipping data with the third-party processors that move your goods (our WMS, FedEx, UPS, your bank, QuickBooks Online, Stripe) under contractual obligations to keep it confidential.' },
        { title: 'Your rights', body: 'You may request a copy of the personal data we hold about you, request corrections, or request deletion. Email privacy@unitemedical.net and we will respond within 30 days.' },
        { title: 'Children', body: 'The platform is intended for business use only and is not directed at anyone under 16.' },
        { title: 'Contact', body: 'Privacy Officer · privacy@unitemedical.net · 1487 Trae Lane, Lithia Springs GA 30122.' },
      ]}
    />
  );
}

export function Terms() {
  useSEO({
    title: 'Terms of Service',
    description: 'Terms of Service for Unite Medical wholesale supply customers. Net-30/60 terms, cancellation, returns, warranty, governing law.',
    canonical: '/terms',
  });
  return (
    <LegalShell
      eyebrow="LEGAL · TERMS OF SERVICE"
      title={<>Terms of <Grad>Service</Grad>.</>}
      lastUpdated="April 2026"
      sections={[
        { title: 'Accounts', body: 'You are responsible for keeping your credentials secure and for all activity that occurs under your account. Notify us immediately of unauthorized use.' },
        { title: 'Orders & Pricing', body: 'Prices and availability are subject to change without notice. Tax, freight, and special fees are calculated at checkout. Quoted prices are valid for the period shown on the quote.' },
        { title: 'Payment Terms', body: 'Net-30 / Net-60 terms are extended at our discretion based on credit review. Past-due invoices accrue 1.5% interest per month.' },
        { title: 'Cancellation', body: 'Orders may be cancelled before label creation at no charge. Once a label is generated, the order is committed to the carrier and our standard return process applies.' },
        { title: 'Warranty', body: 'Products carry the original manufacturer warranty. Unite Medical disclaims all other warranties to the maximum extent permitted by law.' },
        { title: 'Liability', body: 'Unite Medical\'s aggregate liability for any claim arising under these Terms shall not exceed the amount paid for the products giving rise to the claim.' },
        { title: 'Governing Law', body: 'These Terms are governed by the laws of the State of Georgia, with exclusive venue in Fulton County.' },
      ]}
    />
  );
}

export function Returns() {
  useSEO({
    title: 'Returns policy',
    description: 'Returns are accepted for manufacturer defects, and for unopened items within 30 days of the original purchase order. Sterile and single-use items are non-returnable once opened.',
    canonical: '/returns',
  });
  // Policy per PRD-29 §7.4: no returns except manufacturer defect; unopened
  // items within 30 days of the original PO. Verify against the migrated
  // legal doc from the old site before final legal sign-off.
  return (
    <LegalShell
      eyebrow="POLICIES · RETURNS"
      title={<>Returns <Grad>policy</Grad>.</>}
      sections={[
        { title: 'Our policy', body: 'Returns are not accepted except in two cases: (1) manufacturer defect, and (2) unopened items in original packaging, returned within 30 days of the original purchase order.' },
        { title: 'Sterile / single-use items', body: 'Sterile devices, lot-controlled diagnostics, and any item with a broken sterile seal are non-returnable for patient-safety reasons. Once opened, these products cannot re-enter patient care.' },
        { title: 'Manufacturer defects', body: 'If a product arrives defective, damaged, or incorrect, email support@unitemedical.net within 72 hours of delivery with your PO number and photos. We\'ll arrange a replacement or credit — defective items are handled at no cost to you.' },
        { title: 'How to start a return', list: [
          'Email support@unitemedical.net with your PO number and the items you want to return.',
          'Our team confirms eligibility (unopened, within 30 days of the original PO, or manufacturer defect) and issues a return authorization.',
          'Ship the authorized return to our Lithia Springs, GA warehouse.',
        ] },
        { title: 'Refunds', body: 'Approved refunds are issued to the original payment method (or as a credit memo on terms accounts) after the return is received and inspected at our warehouse.' },
      ]}
    />
  );
}

export function Shipping() {
  useSEO({
    title: 'Shipping policy',
    description: 'Same-day order processing and shipping on orders placed before 2pm EST, from our Lithia Springs, Georgia warehouse to all 50 states and territories.',
    canonical: '/shipping',
  });
  // Per PRD-29 §7.5: no shipping prices, no transit-time claims, no
  // Atlanta-metro same-day specifics. Same-day *processing* is the only
  // commitment we advertise.
  return (
    <LegalShell
      eyebrow="POLICIES · SHIPPING"
      title={<>Shipping <Grad>policy</Grad>.</>}
      sections={[
        { title: 'Same-day processing', body: 'Orders placed before 2:00 PM EST, Monday–Friday, are picked, packed, and shipped the same day from our Lithia Springs, Georgia warehouse.' },
        { title: 'Coverage', body: 'We ship to all 50 states and US territories. Shipping charges are calculated at checkout or quoted on your order based on weight, destination, and service level.' },
        { title: 'Drop-ship', body: 'For distributors and pharmacies, we drop-ship to your patient or store with your packing slip and your branding.' },
        { title: 'International', body: 'Currently US-only. Talk to our distributor team about white-label arrangements for cross-border distribution.' },
      ]}
    />
  );
}
