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
    description: 'How Unite Medical collects, uses, stores, and shares your information. SOC 2 Type II environments. No PHI without a signed BAA.',
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
        { title: 'Where it lives', body: 'Customer records and order history are stored in SOC 2 Type II environments hosted in the United States. Backups are encrypted at rest with AES-256.' },
        { title: 'Sharing', body: 'We share order, payment, and shipping data with the third-party processors that move your goods (our WMS, FedEx, UPS, your bank, our billing system Online, Stripe) under contractual obligations to keep it confidential.' },
        { title: 'Your rights', body: 'You may request a copy of the personal data we hold about you, request corrections, or request deletion. Email privacy@unitemedical.com and we will respond within 30 days.' },
        { title: 'Children', body: 'The platform is intended for business use only and is not directed at anyone under 16.' },
        { title: 'Contact', body: 'Privacy Officer · privacy@unitemedical.com · 1487 Trae Lane, Lithia Springs GA 30122.' },
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
        { title: 'Governing Law', body: 'These Terms are governed by the laws of the State of Georgia, with exclusive venue in Douglas County.' },
      ]}
    />
  );
}

export function Returns() {
  useSEO({
    title: 'Returns policy',
    description: '30-day returns on unopened, original packaging. Sterile/single-use items excepted. Damaged-on-arrival replaced free within 72 hours.',
    canonical: '/returns',
  });
  return (
    <LegalShell
      eyebrow="POLICIES · RETURNS"
      title={<>Returns, <Grad>simplified</Grad>.</>}
      sections={[
        { title: 'Return window', body: 'Most products may be returned within 30 days of delivery in unopened, original packaging.' },
        { title: 'Sterile / single-use exceptions', body: 'Sterile devices, lot-controlled diagnostics, and any item with a broken sterile seal are non-returnable for patient-safety reasons.' },
        { title: 'How to start a return', list: [
          'Open your dashboard, find the order, and click "Start a return."',
          'Print the prepaid label we email you (Net-30 customers) or generate one yourself (card customers).',
          'Drop the package at any FedEx or UPS location.',
        ] },
        { title: 'Refunds', body: 'Refunds are issued to the original payment method (or as a credit memo on Net-30 accounts) within 5 business days of receipt at our DC.' },
        { title: 'Damaged or wrong items', body: 'If anything arrives damaged or incorrect, email support@unitemedical.net within 72 hours and we\'ll replace it at no charge — no return needed.' },
      ]}
    />
  );
}

export function Shipping() {
  useSEO({
    title: 'Shipping policy',
    description: 'Free standard ground on orders over $500. Expedited from $38, overnight from $95, same-day available in Atlanta metro. Drop-ship and international options.',
    canonical: '/shipping',
  });
  return (
    <LegalShell
      eyebrow="POLICIES · SHIPPING"
      title={<>Shipping <Grad>policy</Grad>.</>}
      sections={[
        { title: 'Standard ground', body: 'Free on orders above $500. Ships from the closest of our four DCs (Georgia & Nevada, Lithia Springs). Median delivery: 4 business days.' },
        { title: 'Expedited & overnight', body: 'Expedited 2-day from $38; standard overnight from $95. Cut-off is 2:00 PM local DC time for same-day pick.' },
        { title: 'Same-day (Atlanta metro)', body: 'Available for stocked items inside the Atlanta metro perimeter. $95 flat. Delivered by 6 PM if ordered by 2 PM.' },
        { title: 'Drop-ship', body: 'For dealers and pharmacies, we drop-ship to your patient or store with your packing slip and your branding.' },
        { title: 'International', body: 'Currently US-only. Talk to our dealer team about white-label arrangements for cross-border distribution.' },
      ]}
    />
  );
}
