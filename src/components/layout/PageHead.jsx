import { D } from '../../tokens.js';
import { Eyebrow } from '../shared/Eyebrow.jsx';
import { useViewport } from '../../lib/viewport.js';

/**
 * Editorial page masthead. The headline owns the full container width at
 * display scale; the optional `right` media sits on a second row beside the
 * standfirst, so type and image never fight for the same column.
 */
export function PageHead({ eyebrow, title, sub, right }) {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  return (
    <div style={{ padding: `${isMobile ? 44 : 88}px ${padX}px ${isMobile ? 24 : 48}px`, background: D.paper, position: 'relative', overflow: 'hidden' }}>
      {/* Quiet atmospheric wash, mirrors the homepage hero */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(640px 420px at 88% 0%, rgba(94,41,99,.07), transparent 70%),
          radial-gradient(480px 360px at 4% 100%, rgba(184,80,44,.04), transparent 70%)`,
      }} />
      <div className="um-fade-up" style={{ maxWidth: 1360, margin: '0 auto', position: 'relative' }}>
        <Eyebrow style={{ marginBottom: isMobile ? 14 : 26 }}>{eyebrow}</Eyebrow>

        {/* Full-width display headline */}
        <h1
          style={{
            fontFamily: D.display,
            fontSize: 'clamp(42px, 10vw, 116px)',
            fontWeight: 400,
            lineHeight: 0.95,
            letterSpacing: '-0.035em',
            margin: 0,
            paddingBottom: '0.05em',
          }}
        >
          {title}
        </h1>

        {/* Standfirst row: copy left, media right */}
        {(sub || right) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: right && !isMobile ? 'minmax(320px, 1fr) 1.1fr' : '1fr',
              gap: isMobile ? 24 : 72,
              alignItems: 'end',
              marginTop: isMobile ? 18 : 36,
            }}
          >
            {sub ? (
              <p style={{ fontSize: isMobile ? 15.5 : 17.5, lineHeight: 1.6, color: D.ink2, maxWidth: 600, margin: 0, paddingBottom: right && !isMobile ? 8 : 0 }}>
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
