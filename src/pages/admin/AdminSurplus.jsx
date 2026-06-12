/**
 * Admin · Surplus inventory review — PRD-10 Phase 2.
 *
 * Left rail: list of incoming hospital surplus submissions.
 * Right pane: line-by-line review, AI valuation, manual offer
 * adjustments, and "Send offer" action.
 *
 * AI valuation runs through `ai.run('surplus/valuation', ...)` which
 * is stubbed today (no Anthropic key); real numbers come when keys
 * are wired.
 */

import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { ai } from '../../lib/ai/client.js';
import { gmail } from '../../lib/services.js';
import { publishSubmissionLines, offersFor, acceptOffer, declineOffer } from '../../lib/marketplace.js';

const STATUS_COLOR = {
  new:        ['#8f8490', 'NEW'],
  reviewing:  [D.terra, 'REVIEWING'],
  offer_sent: ['#5e2963', 'OFFER SENT'],
  accepted:   ['#2d6a4f', 'ACCEPTED'],
  declined:   ['#c3382d', 'DECLINED'],
  received:   ['#3b8760', 'RECEIVED'],
};

export function AdminSurplus() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const submissions = db.useTable('surplus_submissions', { orderBy: 'submitted_at', dir: 'desc' });
  const [activeId, setActiveId] = useState(submissions[0]?.id);
  const active = db.useRow('surplus_submissions', activeId);
  const lines = db.useTable('surplus_lines', { where: { submission_id: activeId } });

  const [valuating, setValuating] = useState(false);
  const [error, setError] = useState(null);
  const allOffers = db.useTable('surplus_offers', { orderBy: 'created_at', dir: 'desc' });
  const activeOffers = activeId ? offersFor({ submission_id: activeId }) : [];
  void allOffers; // subscription keeps the offers panel live

  function publishToMarketplace() {
    if (!active) return;
    const { published } = publishSubmissionLines(active.id);
    if (published === 0) setError('No unlisted "want" lines to publish — mark lines as want first.');
    else setError(null);
  }

  async function decideOffer(offer, accept) {
    try {
      if (accept) await acceptOffer(offer.id);
      else declineOffer(offer.id);
    } catch (e) {
      setError(e?.message || 'Offer update failed.');
    }
  }

  async function runValuation() {
    if (!active || lines.length === 0) return;
    setValuating(true); setError(null);
    try {
      const normalized = lines.map((l, idx) => ({
        index: idx,
        normalized_name: l.normalized_name || l.raw_description,
        category: l.category || 'Other',
        condition_hint: l.condition || 'unknown',
        expiry_iso: l.expiry_date,
        qty: l.qty,
        gtin: l.gtin,
        flags: l.flags || [],
      }));
      const catalog_matches = lines.map((l) => l.matched_sku ? db.get('products', l.matched_sku) : null).filter(Boolean);
      const { data } = await ai.run('surplus/valuation', {
        input: { normalized_lines_json: { lines: normalized }, catalog_matches_json: catalog_matches },
        source: 'surplus-review',
      });
      const valuations = data?.valuations || [];
      const newTotal = valuations.reduce((a, v) => a + (Number(v.offer_usd_total) || 0), 0);

      for (let i = 0; i < lines.length; i++) {
        const v = valuations[i];
        if (!v) continue;
        db.update('surplus_lines', lines[i].id, {
          decision: v.decision,
          decision_reason: v.decision_reason,
          est_retail_usd: v.est_retail_usd,
          offer_usd_per_unit: v.offer_usd_per_unit,
          offer_usd_total: v.offer_usd_total,
          confidence: v.confidence,
        });
      }
      db.update('surplus_submissions', active.id, {
        estimated_value: lines.reduce((a, l) => a + ((l.est_retail_usd || 0) * (l.qty || 1)), 0),
        offer_total: newTotal,
      });
    } catch (e) {
      setError(e?.message || 'Valuation failed.');
    } finally {
      setValuating(false);
    }
  }

  function adjustLine(line, patch) {
    db.update('surplus_lines', line.id, patch);
    if ('offer_usd_per_unit' in patch) {
      const newTotal = patch.offer_usd_per_unit * (line.qty || 1);
      db.update('surplus_lines', line.id, { offer_usd_total: newTotal });
    }
    const all = db.list('surplus_lines', { where: { submission_id: active.id } });
    const offer_total = all.reduce((a, l) => a + (Number(l.offer_usd_total) || 0), 0);
    db.update('surplus_submissions', active.id, { offer_total });
  }

  async function sendOffer() {
    if (!active) return;
    const summary = lines
      .filter((l) => l.decision === 'want')
      .map((l) => `· ${l.qty}x ${l.normalized_name || l.raw_description} — $${(Number(l.offer_usd_per_unit) || 0).toFixed(2)}/unit ($${(Number(l.offer_usd_total) || 0).toFixed(2)})`)
      .join('\n');
    const passes = lines.filter((l) => l.decision === 'pass').length;

    await gmail.send({
      to: active.contact_email,
      from: 'damon@unitemedical.net',
      subject: `Your surplus submission · ${active.hospital_name || 'Hospital'} · offer attached`,
      body: `${active.contact_name?.split(' ')[0] || 'Hi'} —

Thanks for sending over your surplus list. Here's what we'd like to take, with our offer:

${summary || '(no lines this round)'}

${passes > 0 ? `We're passing on ${passes} line(s) this round — happy to share why on a quick call if useful.\n\n` : ''}Total offer: $${(Number(active.offer_total) || 0).toLocaleString()} · Net-30 ACH on accepted lots · pickup at our cost.

Reply with "accepted" (or any line edits) and we'll get logistics scheduled.

— Damon
Founder, Unite Medical`,
      template_key: 'surplus_offer',
      drafted_by: 'ai-assist:surplus/valuation',
    });

    db.update('surplus_submissions', active.id, { status: 'offer_sent', offer_sent_at: new Date().toISOString() });
  }

  return (
    <AdminShell active="settings">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>SURPLUS · INTAKE</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>{submissions.length} surplus submissions</h1>
      </div>

      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px 1fr', gap: 20 }}>
        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 18 }}>Submissions</div>
          {submissions.length === 0 && (
            <div style={{ padding: 20, color: D.ink3, fontSize: 13 }}>No submissions yet. Visit /surplus to test the intake flow.</div>
          )}
          {submissions.map((s) => {
            const [color, label] = STATUS_COLOR[s.status] || STATUS_COLOR.new;
            return (
              <button key={s.id} onClick={() => setActiveId(s.id)} style={{ width: '100%', textAlign: 'left', display: 'block', padding: '14px 16px', borderTop: `1px solid ${D.line}`, background: activeId === s.id ? 'rgba(94,41,99,.06)' : 'transparent', cursor: 'pointer', fontFamily: D.sans, color: D.ink }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.hospital_name || s.contact_name || 'Anonymous'}</div>
                  <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: `${color}20`, color }}>{label}</span>
                </div>
                <div style={{ fontSize: 11, color: D.ink2, marginTop: 4 }}>
                  {s.total_lines} lines · {fmt.ago(s.submitted_at)}
                </div>
                <div style={{ fontSize: 11, color: D.ink3, marginTop: 2 }}>{s.contact_email}</div>
              </button>
            );
          })}
        </div>

        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 28 }}>
          {!active && <div style={{ color: D.ink3 }}>Select a submission to review.</div>}
          {active && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>SUBMISSION · {fmt.ago(active.submitted_at)}</div>
                  <div style={{ fontFamily: D.display, fontSize: 28, letterSpacing: -0.5, marginTop: 6 }}>{active.hospital_name || 'Anonymous hospital'}</div>
                  <div style={{ fontSize: 13, color: D.ink2, marginTop: 4 }}>
                    {active.contact_name} · {active.contact_email} {active.contact_phone ? `· ${active.contact_phone}` : ''}
                  </div>
                  {active.pickup_location && <div style={{ fontSize: 12, color: D.ink3, marginTop: 4 }}>Pickup: {active.pickup_location}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>OFFER TOTAL</div>
                  <div style={{ fontFamily: D.display, fontSize: 36, color: D.plum, letterSpacing: -0.5 }}>{fmt.money(Number(active.offer_total) || 0)}</div>
                  <div style={{ fontSize: 11, color: D.ink3 }}>est. retail {fmt.money(Number(active.estimated_value) || 0)}</div>
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={runValuation} disabled={valuating} style={{ background: D.ink, color: D.paper, border: 'none', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: valuating ? 'wait' : 'pointer', opacity: valuating ? 0.6 : 1 }}>
                  {valuating ? 'Valuating…' : 'Run AI valuation'}
                </button>
                <button onClick={sendOffer} disabled={!lines.some((l) => l.decision === 'want')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: lines.some((l) => l.decision === 'want') ? 1 : 0.4 }}>
                  Send offer to hospital
                </button>
                <button onClick={publishToMarketplace} disabled={!lines.some((l) => l.decision === 'want' && !l.listed)} style={{ background: 'transparent', color: D.plum, border: `1px solid ${D.plum}`, padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: lines.some((l) => l.decision === 'want' && !l.listed) ? 1 : 0.4 }}>
                  Publish to marketplace ↗
                </button>
              </div>
              {error && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#fbe9e1', color: '#7a2d10', fontSize: 13 }}>{error}</div>}

              <div className="um-scroll-x" style={{ marginTop: 22 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
                  <thead>
                    <tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                      {['PRODUCT', 'CATEGORY', 'COND', 'QTY', 'EST RETAIL', 'OFFER/UNIT', 'OFFER TOTAL', 'DECISION'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 6px', borderBottom: `1px solid ${D.line}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: 20, color: D.ink3, fontSize: 13, textAlign: 'center' }}>No lines.</td></tr>
                    )}
                    {lines.map((l) => (
                      <tr key={l.id} style={{ borderTop: `1px solid ${D.line}` }}>
                        <td style={{ padding: '8px 6px' }}>
                          <div style={{ fontWeight: 500 }}>{l.normalized_name || l.raw_description}</div>
                          {l.normalized_name && l.normalized_name !== l.raw_description && (
                            <div style={{ fontSize: 11, color: D.ink3, marginTop: 2 }}>raw: {l.raw_description}</div>
                          )}
                          {l.decision_reason && (
                            <div style={{ fontSize: 11, color: D.ink3, marginTop: 2 }}>{l.decision_reason}</div>
                          )}
                        </td>
                        <td style={{ padding: '8px 6px', fontSize: 11 }}>{l.category || '—'}</td>
                        <td style={{ padding: '8px 6px', fontSize: 11 }}>{l.condition || '—'}</td>
                        <td style={{ padding: '8px 6px', fontFamily: D.mono }}>{l.qty}</td>
                        <td style={{ padding: '8px 6px', fontFamily: D.mono, fontSize: 11 }}>${(Number(l.est_retail_usd) || 0).toFixed(2)}</td>
                        <td style={{ padding: '8px 6px' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.offer_usd_per_unit || 0}
                            onChange={(e) => adjustLine(l, { offer_usd_per_unit: Number(e.target.value) })}
                            style={{ width: 80, padding: '4px 6px', border: `1px solid ${D.line}`, borderRadius: 6, fontFamily: D.mono, fontSize: 11, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '8px 6px', fontFamily: D.mono, fontWeight: 600, color: D.plum }}>{fmt.money(Number(l.offer_usd_total) || 0)}</td>
                        <td style={{ padding: '8px 6px' }}>
                          <select
                            value={l.decision || ''}
                            onChange={(e) => adjustLine(l, { decision: e.target.value || null })}
                            style={{ padding: '4px 6px', border: `1px solid ${D.line}`, borderRadius: 6, fontFamily: D.mono, fontSize: 11 }}
                          >
                            <option value="">—</option>
                            <option value="want">want</option>
                            <option value="pass">pass</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {activeOffers.length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum, marginBottom: 10 }}>
                    MARKETPLACE OFFERS · {activeOffers.filter((o) => o.status === 'open').length} OPEN
                  </div>
                  {activeOffers.map((o) => {
                    const line = db.get('surplus_lines', o.line_id);
                    return (
                      <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', border: `1px solid ${D.line}`, borderRadius: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {o.buyer_org || o.buyer_name} · ${o.offer_usd_per_unit.toFixed(2)}/unit × {o.qty}
                            <span style={{ fontFamily: D.mono, color: D.plum, marginLeft: 8 }}>{fmt.money(o.offer_usd_total)}</span>
                          </div>
                          <div style={{ fontSize: 11, color: D.ink3, marginTop: 2 }}>
                            {line?.normalized_name || line?.raw_description} · {o.buyer_email} · {fmt.ago(o.created_at)}
                            {o.message ? ` · “${o.message}”` : ''}
                          </div>
                        </div>
                        {o.status === 'open' ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => decideOffer(o, true)} style={{ fontSize: 11, fontFamily: D.mono, letterSpacing: 0.8, padding: '6px 14px', background: '#2d6a4f', color: D.paper, border: 'none', borderRadius: 999, cursor: 'pointer' }}>ACCEPT</button>
                            <button onClick={() => decideOffer(o, false)} style={{ fontSize: 11, fontFamily: D.mono, letterSpacing: 0.8, padding: '6px 14px', background: 'transparent', color: '#c3382d', border: '1px solid #c3382d', borderRadius: 999, cursor: 'pointer' }}>DECLINE</button>
                          </div>
                        ) : (
                          <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '4px 10px', borderRadius: 999, background: o.status === 'accepted' ? '#e8f5ed' : '#fbe9e1', color: o.status === 'accepted' ? '#1d4731' : '#7a2d10' }}>
                            {o.status.toUpperCase()}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
