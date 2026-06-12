import { D } from '../../tokens.js';

/**
 * Pill-chip section eyebrow — mono label with a plum status dot.
 * `pulse` animates the dot (used on the homepage hero).
 */
export function Eyebrow({ children, pulse = false, dark = false, style }) {
  return (
    <div style={{
      fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4,
      color: dark ? D.paper : D.plum,
      display: 'inline-flex', alignItems: 'center', gap: 10,
      border: `1px solid ${dark ? 'rgba(247,242,234,.25)' : D.line}`,
      background: dark ? 'rgba(247,242,234,.07)' : D.card,
      padding: '7px 14px 7px 11px', borderRadius: 999,
      maxWidth: '100%',
      ...style,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: 4,
        background: dark ? D.plumSoft : D.plum, flexShrink: 0,
        animation: pulse ? 'umPulse 2.6s ease-in-out infinite' : undefined,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  );
}
