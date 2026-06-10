/**
 * Admin · Margin policy — PRD-08 Phase 4.
 *
 * Damon sets the per-tier target margin used by the quoting engine
 * and the quote validity window. Defaults from the brief; overrides
 * persist to localStorage (and to org_settings table once PRD-01
 * ships).
 */

import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { useViewport } from '../../lib/viewport.js';
import { loadMarginPolicy, saveMarginPolicy, DEFAULT_MARGIN_POLICY } from '../../lib/marginPolicy.js';

const TIER_DESCRIPTIONS = {
  A:           'Large hospital systems, gov / VA, large retail (CVS, Publix, etc.)',
  B:           'Mid-tier ASCs, regional dealers',
  C:           'Small clinics, one-off purchases (default for new accounts)',
  distributor: 'Approved distributor program — volume, lower margin',
  gov:         'BPA / VA channel — contract pricing',
};

export function AdminMarginPolicy() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;

  const [policy, setPolicy] = useState(() => loadMarginPolicy());
  const [saved, setSaved] = useState(false);

  function update(path, value) {
    setSaved(false);
    if (path.startsWith('tiers.')) {
      const tier = path.slice('tiers.'.length);
      const pct = Math.max(0, Math.min(0.95, Number(value) / 100));
      setPolicy((p) => ({ ...p, tiers: { ...p.tiers, [tier]: pct } }));
    } else {
      setPolicy((p) => ({ ...p, [path]: value }));
    }
  }

  function save() {
    saveMarginPolicy(policy);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  function reset() {
    setPolicy(DEFAULT_MARGIN_POLICY);
    saveMarginPolicy(DEFAULT_MARGIN_POLICY);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AdminShell active="settings">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>QUOTING · MARGIN POLICY</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Margin policy.</h1>
        <p style={{ fontSize: 14, color: D.ink2, marginTop: 10, maxWidth: 720, lineHeight: 1.55 }}>
          Per-customer-tier target margin used by the quoting engine. The brief defaults to 60% across the board; the values below split it by tier per PRD-08 §5.
        </p>
      </div>

      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: '1fr', gap: 18, maxWidth: 880 }}>
        <AdminCard title="Per-tier target margin">
          <div style={{ display: 'grid', gap: 14 }}>
            {Object.keys(DEFAULT_MARGIN_POLICY.tiers).map((tier) => (
              <div key={tier} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '120px 1fr 120px', gap: 14, alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${D.line}` }}>
                <div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum }}>TIER · {tier.toUpperCase()}</div>
                </div>
                <div style={{ fontSize: 13, color: D.ink2, lineHeight: 1.55 }}>{TIER_DESCRIPTIONS[tier]}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    min="0"
                    max="95"
                    step="0.5"
                    value={(policy.tiers[tier] * 100).toFixed(1)}
                    onChange={(e) => update(`tiers.${tier}`, e.target.value)}
                    style={{ width: 84, padding: '8px 10px', border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 14, fontFamily: D.mono, color: D.ink, background: D.paper, textAlign: 'right' }}
                  />
                  <span style={{ fontFamily: D.mono, fontSize: 12, color: D.ink3 }}>%</span>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title="Quote settings">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <label style={{ display: 'block' }}>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum }}>VALIDITY WINDOW (DAYS)</div>
              <input
                type="number"
                min="1"
                max="60"
                value={policy.quote_validity_days}
                onChange={(e) => update('quote_validity_days', Number(e.target.value))}
                style={{ width: 100, marginTop: 6, padding: '8px 10px', border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 14, fontFamily: D.mono, color: D.ink, background: D.paper }}
              />
              <div style={{ fontSize: 12, color: D.ink3, marginTop: 6 }}>How long a generated quote stays valid. Flexport rates typically expire in 7.</div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={policy.expose_landed_cost}
                onChange={(e) => update('expose_landed_cost', e.target.checked)}
              />
              <div>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum }}>EXPOSE LANDED COST TO CUSTOMER</div>
                <div style={{ fontSize: 12, color: D.ink3, marginTop: 4 }}>Default: off. The internal-view PDF always shows it.</div>
              </div>
            </label>
          </div>
        </AdminCard>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" onClick={save} style={{ background: D.plum, color: D.paper, border: 'none', padding: '12px 24px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Save policy</button>
          <button type="button" onClick={reset} style={{ background: 'transparent', color: D.ink2, border: `1px solid ${D.line}`, padding: '11px 22px', borderRadius: 999, fontSize: 13, cursor: 'pointer' }}>Reset to defaults</button>
          {saved && <span style={{ fontSize: 13, color: '#2d6a4f' }}>✓ saved</span>}
        </div>
      </div>
    </AdminShell>
  );
}
