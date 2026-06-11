// About page — full content rewrite per Unite_CTO_Site_Document.md §4b.
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Eyebrow } from '../components/shared/Eyebrow.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { IMG } from '../lib/imageMap.js';

const LEADERS = [
  {
    name: 'Damon R.',
    title: 'Founder & CEO',
    bio:
      'Veteran. 10+ years in global medical supply chain. Founded and sold an orthotic bracing company. Also operates Unite Pharma and Clyne Health. Manages sourcing, manufacturing, distribution, and partner operations.',
  },
  {
    name: 'Jackie S.',
    title: 'Co-Owner',
    bio:
      'Doctor of Podiatric Medicine. Years of clinical and surgical experience across OR and outpatient settings. Brings direct clinical insight to product selection, formulary development, and quality standards.',
  },
];

// Cleaned credentials grid — mirrors the /compliance page. No
// unsubstantiated SBA-certification tiles, no fabricated SKU counts.
const CREDENTIALS = [
  ['FDA Registered', '3015727296', 'Device distribution'],
  ['BPA', '36F79725D0203', 'Via authorized SDVOSB partner'],
  ['CAGE Code', '8MK70', 'Federal contracting'],
  ['DUNS', '117553945', 'SAM registered'],
  ['Veteran-Owned', 'DD214 Verified', 'ID.me verified'],
  ['TAA Compliant', 'Prioritized', 'Country of origin documented'],
  ['Berry Compliant', 'Medava PPE', 'Buy America Act'],
  ['PDAC Approved', 'Credentialed', 'All orthotics + RegeniCool Pro'],
];

export function About() {
  const { isMobile, isTablet } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'About · Built on discipline. Driven by demand. · Unite Medical',
    description:
      'A veteran supply chain operator and a practicing physician built the medical supply company they couldn\u2019t find anywhere else. Lithia Springs, Georgia, est. 2019. FDA-registered, CAGE 8MK70. Over 500 million units distributed.',
    canonical: '/about',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />

      {/* Hero */}
      <div style={{ padding: `${isMobile ? 44 : 80}px ${padX}px ${isMobile ? 24 : 32}px`, background: D.paper }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: isMobile ? 22 : 80, alignItems: 'end' }}>
          <div>
            <Eyebrow style={{ marginBottom: isMobile ? 14 : 24 }}>EST. 2019 · LITHIA SPRINGS, GA</Eyebrow>
            <h1 style={{ fontFamily: D.display, fontSize: 'clamp(46px, 11vw, 108px)', fontWeight: 400, lineHeight: 0.94, letterSpacing: 'clamp(-1.2px, -0.28vw, -2.8px)', margin: 0 }}>
              Built on discipline. Driven by demand.
            </h1>
          </div>
          <div style={{ fontSize: isMobile ? 16 : 17, lineHeight: 1.6, color: D.ink2, maxWidth: 460 }}>
            A veteran supply chain operator and a practicing physician built the medical supply
            company they couldn&apos;t find anywhere else.
          </div>
        </div>
      </div>

      <div style={{ padding: `${isMobile ? 24 : 40}px ${padX}px ${isMobile ? 32 : 64}px` }}>
        <div style={{ maxWidth: 1360, margin: '0 auto' }}>
          <PhotoPlaceholder
            src={IMG.ABOUT_FOUNDER}
            caption="Damon on the warehouse floor"
            height={isMobile ? 280 : 520}
            stripeFrom="#e8ddcd"
            stripeTo="#d9c8b0"
            textColor={D.plum}
            radius={isMobile ? 16 : 22}
            eager
          />
        </div>
      </div>

      {/* A letter from Damon — header pins while the letter scrolls */}
      <div style={{ background: D.paperAlt, padding: `${isMobile ? 56 : 120}px ${padX}px`, borderTop: `1px solid ${D.line}`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.3fr', gap: isMobile ? 28 : 80, alignItems: 'start' }}>
          <div style={!isMobile ? { position: 'sticky', top: 140 } : undefined}>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>THE FOUNDER</div>
            <h2 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 6.5vw, 72px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 0.98, margin: 0 }}>
              A letter from Damon.
            </h2>
            <div style={{ height: 2, background: D.grad, borderRadius: 2, opacity: 0.9, marginTop: 28, width: 72 }} />
          </div>
          <div style={{ fontSize: isMobile ? 16 : 18, lineHeight: 1.75, color: D.ink2 }}>
            <p style={{ marginTop: 0 }}>
              I&apos;ve been in medical supply chain for over a decade. I&apos;ve built brands from
              scratch, manufactured products overseas and domestically, sold a company, and
              started three more. I know what it takes to get a product from a factory floor
              to a patient&apos;s front door because I&apos;ve done every step myself.
            </p>
            <p style={{ marginTop: 18 }}>
              Unite Medical started in 2019 because the customers I&apos;d built relationships
              with over the years kept asking me to do more — source this, stock that, can you
              ship direct to our patients? So I did. And then I kept going.
            </p>
            <p style={{ marginTop: 18 }}>
              We&apos;ve moved over 500 million units. During the pandemic, we were one of the
              largest direct-to-patient drop shippers in the country — getting test kits, PPE,
              and supplies to patients on behalf of labs, hospitals, pharmacies, and retailers
              when the traditional supply chain fell apart.
            </p>
            <p style={{ marginTop: 18 }}>
              Today, we source and distribute Class 1 and Class 2 medical devices. We own every
              unit we sell. We manufacture our own product lines. We build entire white-label
              storefronts for physician groups who want their brand on the front end while we
              run everything behind it.
            </p>
            <p style={{ marginTop: 18 }}>
              We&apos;re the supply chain behind the companies you already trust.
            </p>
            <p style={{ fontFamily: D.display, fontSize: 22, fontStyle: 'italic', color: D.ink, marginTop: 32 }}>— Damon R., Founder & CEO</p>
          </div>
        </div>
      </div>

      {/* Leadership */}
      <div style={{ padding: `${isMobile ? 56 : 96}px ${padX}px`, background: D.paper }}>
        <div style={{ maxWidth: 1360, margin: '0 auto' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>THE LEADERSHIP</div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>
            The people running it.
          </h2>
          <div style={{ marginTop: isMobile ? 32 : 56, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 24 }}>
            {LEADERS.map((l) => {
              const initials = l.name.split(' ').map((w) => w[0]).join('').replace('.', '');
              return (
                <div key={l.name} className="um-card" style={{ border: `1px solid ${D.line}`, borderRadius: 24, padding: isMobile ? 24 : 36, background: D.card, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div aria-hidden="true" style={{
                      width: isMobile ? 56 : 68, height: isMobile ? 56 : 68, borderRadius: '50%',
                      background: D.grad, color: D.paper,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: D.display, fontSize: isMobile ? 22 : 26, letterSpacing: -0.5, flexShrink: 0,
                    }}>{initials}</div>
                    <div>
                      <div style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 32, letterSpacing: -0.5 }}>{l.name}</div>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.plum, marginTop: 4 }}>{l.title.toUpperCase()}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: isMobile ? 14.5 : 15.5, color: D.ink2, lineHeight: 1.65, margin: '20px 0 0 0', paddingTop: 20, borderTop: `1px solid ${D.line}` }}>{l.bio}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Credentials grid (mirrors /compliance) */}
      <div id="compliance" style={{ padding: `${isMobile ? 56 : 96}px ${padX}px`, background: D.paperAlt, borderTop: `1px solid ${D.line}` }}>
        <div style={{ maxWidth: 1360, margin: '0 auto' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>CREDENTIALS</div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(38px, 6.4vw, 64px)', fontWeight: 400, letterSpacing: -1.5, margin: 0, lineHeight: 1.02 }}>
            The paperwork,<br /><Grad>kept clean.</Grad>
          </h2>
          <div style={{ marginTop: isMobile ? 32 : 48, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(3, 1fr)' : 'repeat(4,1fr)', gap: isMobile ? 12 : 18 }}>
            {CREDENTIALS.map(([label, val, sub]) => (
              <div key={label} style={{ padding: '0 0 16px' }}>
                <div style={{ height: 2, background: D.grad, borderRadius: 2, opacity: 0.9, marginBottom: 16 }} />
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label.toUpperCase()}</div>
                <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.4, color: D.ink, marginTop: 8, wordBreak: 'break-word' }}>{val}</div>
                <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
