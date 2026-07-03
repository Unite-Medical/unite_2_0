import { D } from '../../tokens.js';

/**
 * Brand mark — solid surgical-green field, UM monogram, sharp corners.
 * The old orange→magenta gradient chip is retired; a flat single-color
 * mark reads institutional (and prints/embroiders cleanly).
 *
 * `from`/`to` props are kept for call-site compatibility; `from` is used
 * as an explicit field override when callers pass one intentionally.
 */
export function UMLogoMark({ size = 28, field = '#1d5c4d', radius = 0.14 }) {
  const r = Math.round(size * radius);
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      background: field,
      position: 'relative', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={size * 0.62} height={size * 0.5} viewBox="0 0 24 20" fill="none" stroke="#f3f2eb" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v9a5 5 0 0 0 10 0V3" />
        <path d="M13 17V9l4 5 4-5v8" opacity="0.9" />
      </svg>
    </div>
  );
}

export function UMLogo({ size = 28, color = '#16201a', weight = 600, mark = true, letterSpacing = -0.2 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {mark && <UMLogoMark size={size} />}
      <div style={{ fontWeight: weight, fontSize: size * 0.58, color, letterSpacing, lineHeight: 1, fontFamily: D.sans }}>
        Unite <span style={{ opacity: 0.62, fontWeight: Math.max(400, weight - 100) }}>Medical</span>
      </div>
    </div>
  );
}
