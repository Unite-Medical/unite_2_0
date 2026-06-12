/**
 * Surplus marketplace — buyer side (brief §8 Phase 2).
 *
 * Approved hospital surplus lots that Unite Medical has accepted are
 * published here for resale. Buyers (clinics, dealers, exporters)
 * place offers; the surplus desk accepts or declines from
 * /admin/surplus. Brokerage spread is Unite's margin.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { placeOffer } from '../lib/marketplace.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const EMPTY_OFFER = { buyer_name: '', buyer_email: '', buyer_org: '', qty: '', offer_usd_per_unit: '', message: '' };

export function SurplusMarket() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  useSEO({
    title: 'Surplus marketplace — discounted medical supplies',
    description: 'Buy vetted hospital surplus medical supplies at well below wholesale. Inspected lots, Net-30 terms for approved buyers, freight arranged. Veteran-owned, FDA-registered.',
    canonical: '/surplus/market',
  });

  const allLines = db.useTable('surplus_lines', { orderBy: 'listed_at', dir: 'desc' });
  const lots = allLines.filter((l) => l.listed && l.listing_status === 'open');

  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(EMPTY_OFFER);
  const [doneId, setDoneId] = useState(null);
  const [error, setError] = useState(null);

  function startOffer(lot) {
    setOpenId(lot.id);
    setDoneId(null);
    setError(null);
    setForm({ ...EMPTY_OFFER, qty: String(lot.qty), offer_usd_per_unit: String(lot.ask_usd_per_unit || '') });
  }

  function submitOffer(e, lot) {
    e.preventDefault();
    setError(null);
    try {
      placeOffer({
        line_id: lot.id,
        buyer_name: form.buyer_name,
        buyer_email: form.buyer_email,
        buyer_org: form.buyer_org,
        qty: Number(form.qty),
        offer_usd_per_unit: Number(form.offer_usd_per_unit),
        message: form.message,
      });
      setDoneId(lot.id);
      setOpenId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const input = (k, props = {}) => (
    <input
      value={form[k]}
      onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
      style={{ padding: '10px 12px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 13, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans }}
      {...props}
    />
  );

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <section style={{ padding: `${isMobile ? 48 : 84}px ${padX}px ${isMobile ? 30 : 48}px`, maxWidth: 1360, margin: '0 auto' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 16 }}>SURPLUS MARKETPLACE · VETTED LOTS</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 7.5vw, 76px)', fontWeight: 400, letterSpacing: 'clamp(-1px, -0.2vw, -1.8px)', lineHeight: 1.02, margin: 0, maxWidth: 880 }}>
            Hospital surplus, <Grad>inspected and priced to move</Grad>.
          </h1>
          <p style={{ fontSize: 16, color: D.ink2, marginTop: 20, maxWidth: 640, lineHeight: 1.6 }}>
            Every lot below came through our surplus intake, was inspected against expiry and condition standards, and is released at well below wholesale.
            Place an offer at (or under) the ask — our surplus desk responds within one business day. Net-30 ACH for approved buyers, freight arranged at cost.
          </p>
          <div style={{ marginTop: 16, fontSize: 13, color: D.ink2 }}>
            Selling instead? <Link to="/surplus" style={{ color: D.plum, textDecoration: 'underline' }}>Submit your surplus list →</Link>
          </div>
        </section>

        <section style={{ padding: `0 ${padX}px ${isMobile ? 60 : 96}px`, maxWidth: 1360, margin: '0 auto' }}>
          {lots.length === 0 && (
            <div style={{ padding: isMobile ? 28 : 48, background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, textAlign: 'center' }}>
              <div style={{ fontFamily: D.display, fontSize: 26 }}>No open lots right now.</div>
              <p style={{ fontSize: 14, color: D.ink2, marginTop: 10, lineHeight: 1.6 }}>
                Lots publish as hospital submissions clear inspection — usually a few times a week.
                Email <a href="mailto:surplus@unitemedical.net" style={{ color: D.plum }}>surplus@unitemedical.net</a> to get the release list, or check back shortly.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {lots.map((lot) => (
              <div key={lot.id} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{(lot.category || 'SURPLUS').toUpperCase()}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>listed {fmt.ago(lot.listed_at)}</div>
                </div>
                <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.4, marginTop: 10, lineHeight: 1.15 }}>
                  {lot.normalized_name || lot.raw_description}
                </div>
                <div style={{ fontSize: 12, color: D.ink2, marginTop: 8, lineHeight: 1.6 }}>
                  Qty {lot.qty?.toLocaleString()} · condition: {lot.condition || 'inspected'}
                  {lot.expiry_date ? ` · expiry ${lot.expiry_date}` : ''}
                  {lot.gtin ? ` · GTIN ${lot.gtin}` : ''}
                </div>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontFamily: D.display, fontSize: 30, color: D.plum }}>${Number(lot.ask_usd_per_unit || 0).toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: D.ink3 }}>/unit ask{lot.est_retail_usd ? ` · retail ~$${Number(lot.est_retail_usd).toFixed(2)}` : ''}</div>
                </div>

                {doneId === lot.id && (
                  <div style={{ marginTop: 14, padding: 12, background: '#e8f5ed', color: '#1d4731', borderRadius: 10, fontSize: 13 }}>
                    Offer received — the surplus desk replies within one business day.
                  </div>
                )}

                {openId === lot.id ? (
                  <form onSubmit={(e) => submitOffer(e, lot)} style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {input('buyer_name', { placeholder: 'Your name', required: true })}
                      {input('buyer_org', { placeholder: 'Organization' })}
                    </div>
                    {input('buyer_email', { placeholder: 'Work email', type: 'email', required: true })}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {input('qty', { placeholder: `Qty (max ${lot.qty})`, type: 'number', min: 1, max: lot.qty, required: true })}
                      {input('offer_usd_per_unit', { placeholder: '$ / unit', type: 'number', min: 0.01, step: 0.01, required: true })}
                    </div>
                    {input('message', { placeholder: 'Note (optional)' })}
                    {error && <div style={{ padding: 10, background: '#fbe9e1', color: '#7a2d10', borderRadius: 8, fontSize: 12 }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" style={{ flex: 1, background: D.plum, color: D.paper, border: 'none', padding: '11px 0', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        Submit offer
                      </button>
                      <button type="button" onClick={() => setOpenId(null)} style={{ background: 'transparent', color: D.ink2, border: `1px solid ${D.line}`, padding: '11px 18px', borderRadius: 999, fontSize: 13, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button onClick={() => startOffer(lot)} style={{ marginTop: 16, background: D.ink, color: D.paper, padding: '12px 0', borderRadius: 999, fontSize: 13, fontWeight: 600, textAlign: 'center', cursor: 'pointer', border: 'none', width: '100%' }}>
                    Place an offer →
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
