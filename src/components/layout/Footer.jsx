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
    return (
      <a
        href={to}
        target="_blank"
        rel="noreferrer"
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

const COLUMNS = [
  {
    h: 'Catalog',
    links: [
      ['/catalog?cat=Orthotics', 'Orthotics'],
      ['/catalog?cat=Diagnostics', 'Diagnostics'],
      ['/catalog?cat=PPE', 'PPE'],
      ['/catalog?cat=Wound%20Care', 'Wound Care'],
      ['/catalog?cat=Pharmaceuticals', 'Pharmaceuticals'],
      ['/catalog', 'View all 12,400 SKUs'],
    ],
  },
  {
    h: 'Solutions',
    links: [
      ['/segments/asc', 'Ambulatory Surgery Centers'],
      ['/segments/pharmacy', 'Pharmacies'],
      ['/segments/gov', 'Government & VA'],
      ['/segments/distributors', 'Distributors'],
      ['/segments/ems', 'EMS & First Responders'],
      ['/solutions', 'Compare all'],
    ],
  },
  {
    h: 'Services',
    links: [
      ['/services/distribution', 'Nationwide Distribution'],
      ['/services/pdac', 'PDAC Consulting'],
      ['/services/dealer', 'Dealer Program'],
      ['/services/education', 'Education & CEUs'],
      ['/quote', 'Quoting Engine'],
      ['/resources', 'Resource Library'],
    ],
  },
  {
    h: 'Company',
    links: [
      ['/about', 'About'],
      ['/about/veteran-owned', 'Veteran Owned'],
      ['/compliance', 'Compliance'],
      ['/locations', 'Locations'],
      ['/blog', 'Blog'],
      ['/contact', 'Contact'],
      ['/support', 'Support'],
    ],
  },
];

export function Footer() {
  const { isMobile, isTablet } = useViewport();
  const padX = isMobile ? 20 : 40;
  const cols = isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1.4fr 1fr 1fr 1fr 1fr';

  return (
    <footer style={{ background: D.plum, color: D.paper, padding: `${isMobile ? 44 : 64}px ${padX}px ${isMobile ? 24 : 32}px` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: isMobile ? 32 : 48 }}>
          <div>
            <Link to="/" aria-label="Unite Medical home">
              <UMLogo size={30} color={D.paper} weight={500} />
            </Link>
            <p style={{ marginTop: 18, maxWidth: 360, fontSize: 14, lineHeight: 1.6, color: D.plumSoft }}>
              Veteran-owned wholesale medical supply. Built for the channels the Big 3 can&apos;t serve well.
            </p>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plumSoft, marginTop: 24, lineHeight: 1.7 }}>
              VOSB · FDA 3015727296<br />
              CAGE 8MK70 · DUNS 117553945
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
              {col.links.map(([to, label]) => (
                <FooterLink key={`${col.h}-${label}`} to={to}>
                  {label}
                </FooterLink>
              ))}
            </nav>
          ))}
        </div>

        <div
          style={{
            marginTop: isMobile ? 32 : 48,
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
