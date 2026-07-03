/**
 * Surplus marketplace — buyer side of the brokered model (PRD-29 §5).
 *
 * These are listings Unite is BROKERING, not lots Unite bought and is
 * reselling. Buyers (clinics, distributors, exporters, vet/research/
 * non-medical buyers) place offers with a channel declaration; a mutual
 * acceptance is binding, Unite's connection fee is collected up front,
 * and only then is the buyer–seller connection released. Expired lots
 * can't be bought for clinical use — the system enforces the channel
 * guardrail.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { placeOffer, BUYER_CHANNELS } from '../lib/marketplace.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const EMPTY_OFFER = { buyer_name: '', buyer_email: '', buyer_org: '', buyer_channel: 'medical', qty: '', offer_usd_per_unit: '', message: '' };

export function SurplusMarket() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  useSEO({
    title: 'Surplus marketplace — brokered medical inventory',
    description: 'Browse surplus medical inventory Unite is brokering — sealed, in-date lots plus vet/research/export-eligible stock, direct from the seller at well below list. Offer, accept, connect.',
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
        buyer_channel: form.buyer_channel,
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
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 16 }}>SURPLUS MARKETPLACE · BROKERED LISTINGS</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 7.5vw, 76px)', fontWeight: 400, letterSpacing: 'clamp(-1px, -0.2vw, -1.8px)', lineHeight: 1.02, margin: 0, maxWidth: 880 }}>
            Surplus inventory, <Grad>direct from the seller</Grad>.
          </h1>
          <p style={{ fontSize: 16, color: D.ink2, marginTop: 20, maxWidth: 680, lineHeight: 1.6 }}>
            Every listing below is inventory Unite is brokering on behalf of the seller — hospitals,
            surgery centers, and distributors moving excess stock at well below list. Place an offer
            at (or under) the ask. When the seller accepts, the deal is binding: Unite collects a
            transparent connection fee up front, then puts you and the seller directly in touch to
            settle the goods. Freight, compliance docs, and payment handling available on request.
          </p>
          <div style={{ marginTop: 16, fontSize: 13, color: D.ink2 }}>
            Selling instead? <Link to="/surplus" style={{ color: D.plum, textDecoration: 'underline' }}>List your surplus →</Link>
          </div>
        </section>

        <section style={{ padding: `0 ${padX}px ${isMobile ? 60 : 96}px`, maxWidth: 1360, margin: '0 auto' }}>
          {lots.length === 0 && (
            <div style={{ padding: isMobile ? 28 : 48, background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, textAlign: 'center' }}>
              <div style={{ fontFamily: D.display, fontSize: 26 }}>No open listings right now.</div>
              <p style={{ fontSize: 14, color: D.ink2, marginTop: 10, lineHeight: 1.6 }}>
                Listings publish as sellers submit inventory — usually a few times a week.
                Email <a href="mailto:surplus@unitemedical.net" style={{ color: D.plum }}>surplus@unitemedical.net</a> to get the release list, or check back shortly.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {lots.map((lot) => {
              const expired = lot.condition === 'expired' || (lot.expiry_date && new Date(lot.expiry_date) < new Date());
              return (
                <div key={lot.id} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{(lot.category || 'SURPLUS').toUpperCase()}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>listed {fmt.ago(lot.listed_at)}</div>
                  </div>
                  <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.4, marginTop: 10, lineHeight: 1.15 }}>
                    {lot.normalized_name || lot.raw_description}
                  </div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 8, lineHeight: 1.6 }}>
                    Qty {lot.qty?.toLocaleString()} · condition: {lot.condition || 'as listed'}
                    {lot.expiry_date ? ` · expiry ${lot.expiry_date}` : ''}
                    {lot.gtin ? ` · GTIN ${lot.gtin}` : ''}
                  </div>
                  {expired && (
                    <div style={{ marginTop: 8, fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.terra }}>
                      EXPIRED — VET / RESEARCH / NON-MEDICAL / EXPORT CHANNELS ONLY
                    </div>
                  )}
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontFamily: D.display, fontSize: 30, color: D.plum }}>${Number(lot.ask_usd_per_unit || 0).toFixed(2)}</div>
                    <div style={{ fontSize: 12, color: D.ink3 }}>/unit seller ask{lot.est_retail_usd ? ` · retail ~$${Number(lot.est_retail_usd).toFixed(2)}` : ''}</div>
                  </div>

                  {doneId === lot.id && (
                    <div style={{ marginTop: 14, padding: 12, background: '#e8f5ed', color: '#1d4731', borderRadius: 10, fontSize: 13 }}>
                      Offer received — if the seller accepts, the deal binds and we&apos;ll send your
                      connection-fee invoice before releasing contact details.
                    </div>
                  )}

                  {openId === lot.id ? (
                    <form onSubmit={(e) => submitOffer(e, lot)} style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {input('buyer_name', { placeholder: 'Your name', required: true })}
                        {input('buyer_org', { placeholder: 'Organization' })}
                      </div>
                      {input('buyer_email', { placeholder: 'Work email', type: 'email', required: true })}
                      <select
                        value={form.buyer_channel}
                        onChange={(e) => setForm((f) => ({ ...f, buyer_channel: e.target.value }))}
                        style={{ padding: '10px 12px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 13, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans }}
                      >
                        {BUYER_CHANNELS.map((c) => (
                          <option key={c.id} value={c.id} disabled={expired && c.id === 'medical'}>
                            {c.label}{expired && c.id === 'medical' ? ' — unavailable for expired lots' : ''}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {input('qty', { placeholder: `Qty (max ${lot.qty})`, type: 'number', min: 1, max: lot.qty, required: true })}
                        {input('offer_usd_per_unit', { placeholder: '$ / unit', type: 'number', min: 0.01, step: 0.01, required: true })}
                      </div>
                      {input('message', { placeholder: 'Note (optional)' })}
                      <div style={{ fontSize: 11.5, color: D.ink3, lineHeight: 1.5 }}>
                        Offers are binding once the seller accepts. Unite&apos;s connection fee is due
                        before contact details are released. Compliance for regulated / expired goods
                        rests with buyer and seller per marketplace terms.
                      </div>
                      {error && <div style={{ padding: 10, background: '#fbe9e1', color: '#7a2d10', borderRadius: 8, fontSize: 12 }}>{error}</div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" style={{ flex: 1, background: D.plum, color: D.paper, border: 'none', padding: '11px 0', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                          Submit offer
                        </button>
                        <button type="button" onClick={() => setOpenId(null)} style={{ background: 'transparent', color: D.ink2, border: `1px solid ${D.line}`, padding: '11px 18px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button onClick={() => startOffer(lot)} style={{ marginTop: 16, background: D.ink, color: D.paper, padding: '12px 0', borderRadius: 4, fontSize: 13, fontWeight: 600, textAlign: 'center', cursor: 'pointer', border: 'none', width: '100%' }}>
                      Place an offer →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
