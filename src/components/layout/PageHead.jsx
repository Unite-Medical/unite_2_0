import { D } from '../../tokens.js';
import { Eyebrow } from '../shared/Eyebrow.jsx';
import { useViewport } from '../../lib/viewport.js';

/**
 * Masthead — a flat evergreen band that merges with the nav chrome above.
 * Rule + eyebrow, oversized serif headline, then a hairline and the
 * standfirst row. Print-like: no blooms, no orbs, no texture. The type
 * IS the design.
 */
export function PageHead({ eyebrow, title, sub, right }) {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  return (
    <div style={{
      padding: `${isMobile ? 44 : 84}px ${padX}px ${isMobile ? 36 : 64}px`,
      background: D.inkDeep, color: D.paper,
      position: 'relative',
    }}>
      <div style={{ maxWidth: 1360, margin: '0 auto', position: 'relative' }}>
        <div className="um-fade-up">
          <Eyebrow dark style={{ marginBottom: isMobile ? 18 : 30 }}>{eyebrow}</Eyebrow>
        </div>

        <h1
          className="um-fade-up um-d1"
          style={{
            fontFamily: D.display,
            fontSize: 'clamp(44px, 9.5vw, 112px)',
            fontWeight: 400,
            lineHeight: 0.98,
            letterSpacing: '-0.02em',
            margin: 0,
            paddingBottom: '0.05em',
            color: D.paper,
            maxWidth: '11em',
          }}
        >
          {title}
        </h1>

        {(sub || right) && (
          <div
            className="um-fade-up um-d2"
            style={{
              borderTop: '1px solid rgba(243,242,235,.18)',
              display: 'grid',
              gridTemplateColumns: right && !isMobile ? 'minmax(320px, 1fr) 1.1fr' : '1fr',
              gap: isMobile ? 24 : 72,
              alignItems: 'start',
              marginTop: isMobile ? 22 : 44,
              paddingTop: isMobile ? 18 : 28,
            }}
          >
            {sub ? (
              <p style={{ fontSize: isMobile ? 15.5 : 17.5, lineHeight: 1.6, color: 'rgba(243,242,235,.72)', maxWidth: 600, margin: 0 }}>
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
