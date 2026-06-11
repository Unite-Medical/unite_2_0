import { D } from '../../tokens.js';

/**
 * Pill-chip section eyebrow — mono label with a plum status dot.
 * `pulse` animates the dot (used on the homepage hero).
 */
export function Eyebrow({ children, pulse = false, style }) {
  return (
    <div style={{
      fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum,
      display: 'inline-flex', alignItems: 'center', gap: 10,
      border: `1px solid ${D.line}`, background: D.card,
      padding: '7px 14px 7px 11px', borderRadius: 999,
      maxWidth: '100%',
      ...style,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: 4, background: D.plum, flexShrink: 0,
        animation: pulse ? 'umPulse 2.6s ease-in-out infinite' : undefined,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  );
}
