import { D } from '../../tokens.js';

/**
 * Status tag — mono caps in a sharp hairline box with a live dot.
 * Shared visual language for "IN STOCK", "IN PROGRESS", etc.
 */
export function StatusPill({ children, dotColor = '#2e7d5f', style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: D.mono, fontSize: 9, letterSpacing: 1,
      color: D.ink2, background: 'rgba(252,251,246,.9)',
      border: `1px solid ${D.line}`, borderRadius: 3, padding: '4px 9px',
      ...style,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: dotColor, display: 'inline-block', animation: 'umPulse 2.6s ease-in-out infinite' }} />
      {children}
    </span>
  );
}
