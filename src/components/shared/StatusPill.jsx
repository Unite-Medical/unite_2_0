import { D } from '../../tokens.js';

/**
 * Generic status pill — the same visual language as the product "IN STOCK"
 * badge (rounded pill, pulsing dot, mono caps), reusable for any status
 * (e.g. the ISO 13485 "IN PROGRESS" credential on /compliance).
 */
export function StatusPill({ children, dotColor = '#5fbd8a', style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: D.mono, fontSize: 9, letterSpacing: 1,
      color: D.ink2, background: 'rgba(251,247,239,.78)',
      border: `1px solid ${D.line}`, borderRadius: 999, padding: '4px 10px',
      ...style,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: dotColor, display: 'inline-block', animation: 'umPulse 2.6s ease-in-out infinite' }} />
      {children}
    </span>
  );
}
