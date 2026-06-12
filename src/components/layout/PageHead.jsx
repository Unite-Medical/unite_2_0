import { D } from '../../tokens.js';
import { Eyebrow } from '../shared/Eyebrow.jsx';
import { useViewport } from '../../lib/viewport.js';

/**
 * Midnight masthead. Every subpage opens on a deep-ink band: cream display
 * type at full container width, standfirst + optional media on a second row.
 * The dark first screen is what makes the redesign read site-wide.
 */
export function PageHead({ eyebrow, title, sub, right }) {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  return (
    <div className="um-grain" style={{
      padding: `${isMobile ? 48 : 96}px ${padX}px ${isMobile ? 36 : 72}px`,
      background: D.inkDeep, color: D.paper,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Atmosphere: plum bloom top-right, ember low-left, faint grid feel */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(820px 520px at 92% -10%, rgba(94,41,99,.5), transparent 70%),
          radial-gradient(520px 380px at 0% 110%, rgba(246,79,0,.12), transparent 70%)`,
      }} />
      {/* Drifting aurora orbs — same living-light language as the
          homepage glass sections, carried to every subpage masthead. */}
      <div aria-hidden="true" className="um-orb um-orb-a" style={{ width: 460, height: 460, top: '-55%', right: '4%', background: 'radial-gradient(circle, rgba(151,71,160,.55), rgba(94,41,99,0) 70%)' }} />
      <div aria-hidden="true" className="um-orb um-orb-c" style={{ width: 340, height: 340, bottom: '-60%', left: '14%', background: 'radial-gradient(circle, rgba(246,79,0,.3), rgba(246,79,0,0) 70%)' }} />
      <div style={{ maxWidth: 1360, margin: '0 auto', position: 'relative' }}>
        <div className="um-fade-up">
          <Eyebrow dark style={{ marginBottom: isMobile ? 16 : 28 }}>{eyebrow}</Eyebrow>
        </div>

        {/* Full-width display headline */}
        <h1
          className="um-fade-up um-d1"
          style={{
            fontFamily: D.display,
            fontSize: 'clamp(42px, 10vw, 116px)',
            fontWeight: 400,
            lineHeight: 0.95,
            letterSpacing: '-0.035em',
            margin: 0,
            paddingBottom: '0.05em',
            color: D.paper,
          }}
        >
          {title}
        </h1>

        {/* Standfirst row: copy left, media right */}
        {(sub || right) && (
          <div
            className="um-fade-up um-d2"
            style={{
              display: 'grid',
              gridTemplateColumns: right && !isMobile ? 'minmax(320px, 1fr) 1.1fr' : '1fr',
              gap: isMobile ? 24 : 72,
              alignItems: 'end',
              marginTop: isMobile ? 18 : 40,
            }}
          >
            {sub ? (
              <p style={{ fontSize: isMobile ? 15.5 : 17.5, lineHeight: 1.6, color: 'rgba(247,242,234,.72)', maxWidth: 600, margin: 0, paddingBottom: right && !isMobile ? 8 : 0 }}>
                {sub}
              </p>
            ) : <span />}
            {right}
          </div>
        )}
      </div>
    </div>
  );
}
