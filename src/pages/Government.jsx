// Government procurement page — promoted to primary nav per spec §4h.
// Replaces /segments/gov (which now 301-redirects here at the edge).
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { IMG } from '../lib/imageMap.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const credentials = [
  { label: 'BPA', value: '36F79725D0203', sub: 'via authorized SDVOSB partner' },
  { label: 'CAGE', value: '8MK70', sub: 'Federal contracting identifier' },
  { label: 'Berry', value: 'Medava PPE line', sub: 'Buy America Act' },
  { label: 'Buy America', value: 'TAA Eligible', sub: 'Prioritized sourcing' },
];

const mechanisms = [
  {
    label: 'MSPV-NG',
    description:
      'Medava products available through SDVOSB partner contract 36F79725D0203 · VA-wide',
  },
  {
    label: 'SAM.GOV',
    description:
      'Active registration · CAGE 8MK70 · Ready to bid RFQs, IFBs, and RFPs',
    href: 'https://sam.gov/',
  },
  {
    label: 'GSA Advantage',
    description: 'Medava catalog available via federal purchase card',
    href: 'https://www.gsaadvantage.gov/advantage/ws/search/advantage_search?q=0:8medava&db=0&searchType=0',
  },
];

export function Government() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Government & VA Procurement · Unite Medical',
    description:
      'Medava products available through MSPV-NG and GSA Advantage via authorized partner contract 36F79725D0203. Berry-compliant PPE, TAA-compliant sourcing, full compliance documentation on request.',
    canonical: '/government',
  });

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="GOVERNMENT · PROCUREMENT"
        title={<>Veteran-owned. <em>On contract.</em></>}
        sub="Medava products available through MSPV-NG and GSA Advantage. Berry-compliant PPE, TAA-compliant sourcing, and full compliance documentation on request."
        right={
          <PhotoPlaceholder
            src={IMG.GOV_WAREHOUSE}
            alt="Strapped shipping crate on a pallet in a warehouse bay, American flag on the wall behind"
            caption="warehouse bay, ready for dispatch"
            height={isMobile ? 220 : 360}
            stripeFrom="#e8ddcd" stripeTo="#d9c8b0" textColor={D.plum}
            radius={16}
            eager
          />
        }
      />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `8px ${padX}px ${isMobile ? 56 : 96}px` }}>
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)',
          gap: isMobile ? '24px 16px' : 0,
          borderTop: isMobile ? 'none' : `1px solid ${D.line}`,
          paddingTop: isMobile ? 0 : 36,
        }}>
          {credentials.map((c) => (
            <div key={c.label} style={!isMobile ? { borderLeft: `1px solid ${D.line}`, paddingLeft: 28, paddingRight: 20 } : undefined}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.plum }}>{c.label.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 20 : 30, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1.05, wordBreak: 'break-word' }}>{c.value}</div>
              <div style={{ fontSize: 12, color: D.ink2, marginTop: 8 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontFamily: D.display, fontSize: isMobile ? 30 : 44, letterSpacing: -0.8, marginTop: isMobile ? 48 : 72, marginBottom: 24 }}>
          Procurement mechanisms we support.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? 14 : 18 }}>
          {mechanisms.map((m) => (
            <div key={m.label} style={{ border: `1px solid ${D.line}`, borderRadius: 14, padding: isMobile ? 18 : 24 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.plum }}>{m.label}</div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: D.ink2, marginTop: 10 }}>{m.description}</div>
              {m.href && (
                <a
                  href={m.href}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-block', marginTop: 14, fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum }}
                >
                  OPEN LISTING →
                </a>
              )}
            </div>
          ))}
        </div>

        <h2 style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 38, letterSpacing: -0.6, marginTop: isMobile ? 48 : 72, marginBottom: 16 }}>
          Set-Asides
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: D.ink2, maxWidth: 760 }}>
          Medava products are available through SDVOSB contract channels via authorized
          partner. Unite Medical is a veteran-owned small business (CAGE 8MK70, SAM
          registered).
        </p>

        <div style={{ background: D.plum, color: D.paper, borderRadius: 18, padding: isMobile ? 28 : 40, marginTop: isMobile ? 48 : 72 }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plumSoft }}>GOVERNMENT SALES DESK</div>
          <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 36, letterSpacing: -0.6, marginTop: 10, marginBottom: 12 }}>
            Need compliance documentation or contract pricing?
          </h3>
          <p style={{ color: '#e5d6e7', lineHeight: 1.55, maxWidth: 660 }}>
            Request TAA / Berry attestations, country-of-origin documentation,
            capability statements, or schedule a call with our government sales team.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <a href="/compliance#docs" style={{ background: D.paper, color: D.plum, padding: '11px 18px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>Request documentation</a>
            <a href="/contact" style={{ background: 'transparent', color: D.paper, border: `1.5px solid ${D.paper}`, padding: '10px 18px', borderRadius: 999, fontSize: 14, fontWeight: 500 }}>Contact government sales</a>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
