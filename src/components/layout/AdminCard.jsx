import { useId } from 'react';
import { D } from '../../tokens.js';

export function AdminCard({ title, children }) {
  return (
    <div className="uw-admin-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="uw-admin-card-title">{title}</h2>

      </div>
      {children}
    </div>
  );
}

export function Sparkline({ points, tall, dual }) {
  const h = tall ? 200 : 120;
  const w = 700;
  const max = Math.max(1, ...points.map(value => Number(value) || 0));
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / Math.max(1, points.length - 1)) * w} ${h - (v / max) * h * 0.85}`).join(' ');
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  const gradId = useId();
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={D.plum} stopOpacity="0.3" />
          <stop offset="100%" stopColor={D.plum} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={D.plum} strokeWidth="2" />
      {dual && (
        <path
          d={points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / Math.max(1, points.length - 1)) * w} ${h - (v * 0.7 / max) * h * 0.85}`).join(' ')}
          fill="none" stroke={D.terra} strokeWidth="2" strokeDasharray="3,3"
        />
      )}
    </svg>
  );
}
