import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { StatusPill } from '../components/shared/StatusPill.jsx';
import { IMG } from '../lib/imageMap.js';
import { db } from '../lib/db.js';
import { gmail } from '../lib/services.js';
import { uid } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// Credentials per spec §4l. The unsubstantiated SBA-certification tile and
// the unverified PDAC SKU count have been removed.
const CREDENTIALS = [
  { label: 'FDA Registered', val: '3015727296', sub: 'Device distribution', anchor: 'fda' },
  { label: 'BPA', val: '36F79725D0203', sub: 'Via authorized SDVOSB partner', anchor: 'bpa' },
  { label: 'CAGE Code', val: '8MK70', sub: 'Federal contracting identifier', anchor: 'cage' },
  { label: 'DUNS', val: '117553945', sub: 'SAM.gov registered', anchor: 'duns' },
  { label: 'Veteran-Owned', val: 'DD214 Verified', sub: 'ID.me verified', anchor: 'veteran' },
  { label: 'TAA Compliant', val: 'Prioritized', sub: 'TAA-compliant sourcing prioritized', anchor: 'taa' },
  { label: 'Berry Compliant', val: 'Medava PPE line', sub: 'Buy America Act', anchor: 'berry' },
  { label: 'PDAC Approved', val: 'Credentialed', sub: 'All Unite Medical orthotics + RegeniCool™ Pro', anchor: 'pdac' },
  // Pursuit confirmed active (PRD-28 §3.4) — surfaced with an IN PROGRESS
  // status pill, tied to the "Quality management" policy below.
  { label: 'ISO 13485', val: 'Quality management', sub: 'Certification pursuit active', anchor: 'iso', badge: 'IN PROGRESS' },
];

// Policies per spec §4l: ISO is "pursuing" (not "aligned"). Cold-chain and
// audit-environment claims that aren't currently true have been removed.
const POLICIES = [
  { t: 'Quality management', s: 'Pursuing ISO 13485 certification. Documented procedures across receiving, storage, and order picking. Every lot scanned, every recall traceable to a customer.' },
  { t: 'Country-of-origin', s: 'Every SKU tied to a documented country of origin and HTS code. TAA, Buy America, and Berry compliance certifications generated on demand.' },
  // MDR scope corrected (PRD-28 §3.4): Unite files for its OWN products as
  // manufacturer/distributor of record — never on customers' behalf.
  { t: 'Recalls & adverse events', s: 'Lot-level traceability for recall management. As the manufacturer/distributor of record, we file MDR-eligible reports to the FDA for our own products.' },
  { t: 'Supplier qualification', s: 'Every manufacturer audited against an internal questionnaire covering FDA registration, ISO certification, and product testing standards before approval.' },
];

function DocLibrary() {
  const [requested, setRequested] = useState(new Set());
  const [busy, setBusy] = useState(null);

  async function request(doc) {
    setBusy(doc);
    db.insert('doc_requests', { id: uid('dr'), doc, requested_at: new Date().toISOString(), status: 'queued' });
    await gmail.send({ to: 'support@unitemedical.net', subject: `Doc request · ${doc}`, body: `Customer requested: ${doc}` });
    setRequested((s) => new Set([...s, doc]));
    setBusy(null);
  }

  // Document list per spec §4l. Audit-environment reports and internal SOP
  // documents that we don't actually hand out have been pruned.
  const docs = [
    'W-9 · current FY',
    'Certificate of Insurance',
    'FDA Establishment Registration',
    'Capability Statement (federal)',
    'Business Associate Agreement (HIPAA)',
    'TAA / Berry country-of-origin attestations',
  ];

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {docs.map((d) => {
        const isReq = requested.has(d);
        return (
          <li key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: `1px solid ${D.line}`, fontSize: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, color: D.ink }}>
              <span style={{ color: D.plum }}><Icon.shield /></span>
              {d}
            </span>
            <button disabled={isReq || busy === d} onClick={() => request(d)} style={{ background: 'transparent', color: isReq ? D.ink3 : D.plum, border: 'none', cursor: isReq ? 'default' : 'pointer', fontFamily: D.mono, fontSize: 11, letterSpacing: 1, padding: 0 }}>
              {busy === d ? 'SENDING…' : isReq ? '✓ REQUESTED' : 'REQUEST'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Compliance() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Compliance — FDA, BPA, CAGE, DUNS, TAA, Berry, PDAC',
    description:
      'FDA Establishment Registration #3015727296. BPA 36F79725D0203. CAGE 8MK70. DUNS 117553945. Veteran-owned. TAA, Berry, and PDAC documentation on request.',
    canonical: '/compliance',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="COMPLIANCE · CREDENTIALS · POLICY"
          title={<>The paperwork,<br /><Grad>kept clean.</Grad></>}
          sub="Distribution is a regulated business. Below are the certifications, policies, and audit trails that keep us trusted by health systems, ASCs, and pharmacy boards nationwide."
          right={
            <PhotoPlaceholder
              src={IMG.COMPLIANCE_FILES}
              alt="Hands filing an archival folder into ordered compliance records"
              caption="records, kept in order"
              height={isMobile ? 220 : 360}
              stripeFrom="#e8ddcd" stripeTo="#d9c8b0" textColor={D.plum}
              radius={16}
              eager
            />
          }
        />

        <section id="credentials" style={{ padding: `24px ${padX}px ${isMobile ? 56 : 80}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 12 : 18 }}>
              {CREDENTIALS.map((c) => (
                <div key={c.label} id={c.anchor} style={{ padding: '0 0 20px' }}>
                  <div style={{ height: 2, background: D.grad, borderRadius: 2, opacity: 0.9, marginBottom: 20 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{c.label.toUpperCase()}</div>
                    {c.badge && <StatusPill dotColor={D.terra}>{c.badge}</StatusPill>}
                  </div>
                  <div style={{ fontFamily: D.display, fontSize: 26, letterSpacing: -0.4, color: D.ink, marginTop: 8 }}>{c.val}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{c.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ background: D.paperAlt, padding: `${isMobile ? 56 : 96}px ${padX}px`, borderTop: `1px solid ${D.line}`, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>POLICIES</div>
            <h2 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>
              Documented. Auditable. <Grad>On request.</Grad>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 14, marginTop: 32 }}>
              {POLICIES.map((p) => (
                <div key={p.t} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: 28 }}>
                  <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.4, color: D.ink }}>{p.t}</div>
                  <p style={{ fontSize: 14.5, color: D.ink2, marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>{p.s}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="docs" style={{ padding: `${isMobile ? 56 : 96}px ${padX}px`, background: D.paper }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.4fr', gap: isMobile ? 28 : 64, alignItems: 'start' }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 18 }}>DOCUMENT REQUESTS</div>
              <h2 style={{ fontFamily: D.display, fontSize: 48, fontWeight: 400, letterSpacing: -1, lineHeight: 1.05, margin: 0 }}>
                Need a W-9, COI,<br />or BAA?
              </h2>
              <p style={{ fontSize: 15, color: D.ink2, marginTop: 16, lineHeight: 1.6 }}>
                Most documents are auto-generated from your portal in under a minute. The rest, our compliance team turns around inside one business day.
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
                <button onClick={() => navigate('/contact')} style={{ background: D.ink, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: D.sans, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  Request documents <Icon.arrow />
                </button>
              </div>
            </div>

            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, padding: 32 }}>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.ink3, marginBottom: 14 }}>SELF-SERVE LIBRARY</div>
              <DocLibrary />
            </div>
          </div>
        </section>

        <section style={{ padding: `${isMobile ? 56 : 80}px ${padX}px`, background: D.plum, color: D.paper }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: isMobile ? 22 : 64, alignItems: 'center' }}>
            <h2 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 400, letterSpacing: -1, lineHeight: 1.08, margin: 0 }}>
              Documentation for your auditors.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: D.plumSoft, margin: 0 }}>
              Our supplier-qualification documentation — registrations, attestations, and
              quality records — is available to regulators and health-system auditors on
              request. Contact our compliance team and we&apos;ll provide what your review requires.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
