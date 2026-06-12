import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { UMLogo } from '../shared/Logo.jsx';
import { useViewport } from '../../lib/viewport.js';

const linkStyle = {
  display: 'block',
  fontSize: 14,
  color: D.plumSoft,
  marginBottom: 10,
  cursor: 'pointer',
  transition: 'color .15s',
};

function FooterLink({ to, external, children }) {
  if (external) {
    // tel:/mailto: should stay in-window; only http(s) gets _blank.
    const isProtocolLink = /^(?:tel:|mailto:)/i.test(to);
    return (
      <a
        href={to}
        target={isProtocolLink ? undefined : '_blank'}
        rel={isProtocolLink ? undefined : 'noreferrer'}
        style={linkStyle}
        onMouseEnter={(e) => (e.currentTarget.style.color = D.paper)}
        onMouseLeave={(e) => (e.currentTarget.style.color = D.plumSoft)}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      to={to}
      style={linkStyle}
      onMouseEnter={(e) => (e.currentTarget.style.color = D.paper)}
      onMouseLeave={(e) => (e.currentTarget.style.color = D.plumSoft)}
    >
      {children}
    </Link>
  );
}

// Footer columns per Unite_CTO_Site_Document.md §3b.
// Solutions section removed (page killed). Catalog column collapsed into the
// browse CTA. Education & CEUs and Veteran Owned links removed.
const COLUMNS = [
  {
    h: 'Services',
    links: [
      ['/services/distribution', 'Distribution'],
      ['/services/pdac', 'PDAC Consulting'],
      ['/services/private-label', 'Private Label'],
      ['/services/distributors', 'Distributor Program'],
      ['/government', 'Government'],
    ],
  },
  {
    h: 'Company',
    links: [
      ['/about', 'About'],
      ['/procurement', 'Procurement & Diversity'],
      ['/compliance', 'Compliance'],
      ['/locations', 'Locations'],
      ['/blog', 'Blog'],
      ['/case-studies/tjs', 'TJS Case Study'],
    ],
  },
  {
    h: 'Support',
    links: [
      ['/shortage-list', 'Shortage List Matcher'],
      ['/supply-risk', 'Supply Risk Monitor'],
      ['/contact', 'Contact'],
      ['/support', 'FAQs'],
      ['tel:+18338686483', '833.868.6483', true],
      ['mailto:support@unitemedical.net', 'support@unitemedical.net', true],
    ],
  },
];

export function Footer() {
  const { isMobile, isTablet } = useViewport();
  const padX = isMobile ? 20 : 40;
  // 1 brand col + 3 link cols.
  const cols = isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1.6fr 1fr 1fr 1fr';

  return (
    <footer className="um-grain" style={{ background: D.plum, color: D.paper, padding: `${isMobile ? 44 : 64}px ${padX}px ${isMobile ? 24 : 32}px`, position: 'relative', overflow: 'hidden' }}>
      {/* Aurora drift — the same living-light language as the glass sections */}
      <div aria-hidden="true" className="um-orb um-orb-b" style={{ width: 520, height: 520, top: '-30%', right: '-8%', background: 'radial-gradient(circle, rgba(24,16,27,.55), rgba(24,16,27,0) 70%)' }} />
      <div aria-hidden="true" className="um-orb um-orb-a" style={{ width: 420, height: 420, bottom: '-35%', left: '-6%', background: 'radial-gradient(circle, rgba(246,79,0,.22), rgba(246,79,0,0) 70%)' }} />
      <div style={{ maxWidth: 1360, margin: '0 auto', position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: isMobile ? 32 : 48 }}>
          <div>
            <Link to="/" aria-label="Unite Medical home">
              <UMLogo size={30} color={D.paper} weight={500} />
            </Link>
            <p style={{ marginTop: 18, maxWidth: 360, fontSize: 14, lineHeight: 1.6, color: D.plumSoft }}>
              Veteran-owned wholesale medical supply.
            </p>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plumSoft, marginTop: 24, lineHeight: 1.7 }}>
              FDA 3015727296 · CAGE 8MK70 · DUNS 117553945
            </div>

            <div style={{ marginTop: 22 }}>
              <Link
                to="/quote"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: D.paper,
                  color: D.plum,
                  padding: '11px 18px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: D.sans,
                }}
              >
                Start a quote →
              </Link>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.h} aria-label={col.h}>
              <div
                style={{
                  fontFamily: D.display,
                  fontSize: 20,
                  letterSpacing: -0.3,
                  marginBottom: 14,
                }}
              >
                {col.h}
              </div>
              {col.links.map(([to, label, external]) => (
                <FooterLink key={`${col.h}-${label}`} to={to} external={external}>
                  {label}
                </FooterLink>
              ))}
            </nav>
          ))}
        </div>

        {/* Oversized typographic signature — clipped at the baseline */}
        <div aria-hidden="true" style={{ marginTop: isMobile ? 40 : 72, overflow: 'hidden', height: isMobile ? '13vw' : 'min(11vw, 150px)' }}>
          <div
            style={{
              fontFamily: D.display,
              fontWeight: 400,
              fontSize: isMobile ? '15.5vw' : 'min(12.5vw, 172px)',
              lineHeight: 0.78,
              letterSpacing: '-0.04em',
              color: 'rgba(247,242,234,.16)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            Unite Medical
          </div>
        </div>

        <div
          style={{
            marginTop: isMobile ? 18 : 24,
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,.14)',
            fontFamily: D.mono,
            fontSize: 11,
            color: D.plumSoft,
            display: 'flex',
            flexDirection: isMobile ? 'column-reverse' : 'row',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
          }}
        >
          <div>© 2026 Unite Medical Supply · 1487 Trae Lane · Lithia Springs, GA 30122</div>
          <div style={{ display: 'flex', gap: isMobile ? 14 : 22, flexWrap: 'wrap' }}>
            <Link to="/compliance" style={{ color: D.plumSoft }}>Compliance</Link>
            <Link to="/compliance#docs" style={{ color: D.plumSoft }}>Documents</Link>
            <Link to="/privacy" style={{ color: D.plumSoft }}>Privacy</Link>
            <Link to="/terms" style={{ color: D.plumSoft }}>Terms</Link>
            <Link to="/support" style={{ color: D.plumSoft }}>Support</Link>
            <Link
              to="/admin"
              style={{ color: D.paper, background: 'rgba(255,255,255,.12)', padding: '3px 10px', borderRadius: 999, letterSpacing: 1.1 }}
              title="Admin Console"
            >
              ADMIN
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
