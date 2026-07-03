import { D } from '../../tokens.js';

/**
 * Section eyebrow — a short rule + mono caps label.
 * The old pill-chip is gone; this reads like a figure label in a
 * technical document. `pulse` keeps a live dot for realtime contexts.
 */
export function Eyebrow({ children, pulse = false, dark = false, style }) {
  const color = dark ? D.plumSoft : D.plum;
  return (
    <div style={{
      fontFamily: D.mono, fontSize: 11, letterSpacing: 2,
      color,
      display: 'inline-flex', alignItems: 'center', gap: 12,
      textTransform: 'uppercase',
      maxWidth: '100%',
      ...style,
    }}>
      {pulse ? (
        <span style={{
          width: 7, height: 7, borderRadius: 4, flexShrink: 0,
          background: color,
          animation: 'umPulse 2.6s ease-in-out infinite',
        }} />
      ) : (
        <span aria-hidden="true" style={{ width: 28, height: 1, background: color, flexShrink: 0, opacity: 0.9 }} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  );
}
