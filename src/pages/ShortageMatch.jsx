/**
 * Shortage-list matcher — the "no-EDI intake" page (Cato-gap feature).
 *
 * A buyer pastes (or uploads) their backorder / shortage list exactly as it
 * exits their system — no formatting, no EDI, no portal setup — and the
 * matcher ranks every line against the stocked catalog in real time:
 *
 *   stocked    → exact item is on our shelf, add straight to cart
 *   equivalent → we stock functional alternates worth reviewing
 *   sourcing   → goes to the quoting engine / vendor network
 *
 * Matching runs fully client-side (src/lib/matching.js) so results appear
 * as you type. Submitting saves a `shortage_requests` row + a CRM lead so
 * sales follows up on the sourcing lines.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { db } from '../lib/db.js';
import { uid } from '../lib/format.js';
import { cartStore } from '../store/cart.js';
import { matchShortageList, captureCrossReferences } from '../lib/matching.js';
import { captureShortageListMisses } from '../lib/quoteMisses.js';

const SAMPLE = `12 x nitrile exam gloves, large
Influenza A&B rapid test 25ct — 4 boxes
KGN-200 hinged knee brace, qty 6
strep a test cassettes x10
surgical gowns level 3, 2 cases`;

// 3-supply-state matching (PRD-29 §4.1): IN STOCK = real available
// inventory (on-hand − reserved); WE SOURCE = matched line with no shelf
// stock (vetted manufacturer network); QUOTE = open RFQ.
const STATUS_META = {
  stocked:    { label: 'IN STOCK',    color: '#3b8760', bg: 'rgba(59,135,96,.1)' },
  source:     { label: 'WE SOURCE',   color: D.terra,   bg: 'rgba(184,80,44,.1)' },
  equivalent: { label: 'EQUIVALENTS', color: D.terra,   bg: 'rgba(184,80,44,.1)' },
  sourcing:   { label: 'QUOTE',       color: D.plum,    bg: 'rgba(29,92,77,.08)' },
};

function MatchRow({ line, isMobile }) {
  const meta = STATUS_META[line.status];
  const picks = (line.status === 'stocked' || line.status === 'source') ? [line.match] : line.alternates;
  return (
    <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, padding: isMobile ? 14 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: meta.color, background: meta.bg, padding: '4px 10px', borderRadius: 4, flexShrink: 0 }}>
          {meta.label}
        </span>
        <span style={{ fontFamily: D.mono, fontSize: 12, color: D.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 160 }}>
          {line.raw}
        </span>
        {line.qty > 1 && <span style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>QTY {line.qty}</span>}
      </div>

      {picks.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {picks.filter(Boolean).map((p) => (
            <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/products/${encodeURIComponent(p.sku)}`} style={{ fontSize: 14, fontWeight: 600, color: D.ink, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </Link>
                <div style={{ fontFamily: D.mono, fontSize: 10.5, color: D.ink3, marginTop: 2 }}>
                  {p.sku} · {p.category}{p.pack_size ? ` · ${p.pack_size}` : ''}
                </div>
              </div>
              <div style={{ fontFamily: D.display, fontSize: 18, color: D.plum, flexShrink: 0 }}>{p.price == null ? 'Quote' : `$${Number(p.price).toFixed(2)}`}</div>
              {line.status === 'stocked' ? (
                <button
                  onClick={() => cartStore.add(p.sku, line.qty)}
                  aria-label={`Add ${p.name} to cart`}
                  style={{ background: D.ink, color: D.paper, border: 'none', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <Icon.plus />
                </button>
              ) : (
                <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.ink3, flexShrink: 0 }}>VIA SOURCING</span>
              )}
            </div>
          ))}
        </div>
      )}

      {line.status === 'source' && (
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2 }}>
          We carry this line but it&apos;s not on the shelf right now — we source it through our vetted manufacturer network and quote you a firm price and delivery window.
        </div>
      )}
      {line.status === 'sourcing' && (
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2 }}>
          Not in our catalog — this line opens an RFQ with our sourcing desk when you submit below.
        </div>
      )}
    </div>
  );
}

export function ShortageMatch() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  useSEO({
    title: 'Match your shortage list against our full supply chain — instantly',
    description: 'We instantly check each line against our stock, our vetted manufacturer network, and our sourcing desk — then come back with what we can supply and a quote for the rest.',
    canonical: '/shortage-list',
  });

  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  // Medical-safety guardrail (PRD-29 §4.1.4): the client tells us which
  // cross-SKUs are acceptable — we never guess equivalents on their behalf.
  const [substitutes, setSubstitutes] = useState('');
  const [submittedId, setSubmittedId] = useState(null);
  const [error, setError] = useState(null);

  const result = useMemo(() => (text.trim() ? matchShortageList(text) : null), [text]);

  function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || '').slice(0, 20000));
    reader.readAsText(file);
    e.target.value = '';
  }

  function submit(e) {
    e.preventDefault();
    setError(null);
    if (!result || result.summary.total === 0) {
      setError('Paste at least one line first.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required so we can send pricing for the sourcing lines.');
      return;
    }
    const id = uid('short');
    db.insert('shortage_requests', {
      id,
      email: email.trim(),
      organization: org.trim(),
      raw_text: text,
      // Client-provided acceptable cross-SKUs (PRD-29 §4.1.4) — the approved
      // substitutes list, verbatim, for the sourcing desk + cross-ref DB.
      acceptable_substitutes: substitutes.trim() || null,
      line_count: result.summary.total,
      matched: result.summary.stocked,
      source_lines: result.summary.source,
      substitutes: result.summary.equivalent,
      unmatched: result.summary.sourcing,
      lines: result.lines.map((l) => ({
        raw: l.raw, qty: l.qty, status: l.status,
        sku: l.match?.sku || null,
        alternates: l.alternates.map((a) => a.sku),
      })),
      status: 'new',
    });
    // Cross-reference SKU capture (PRD-29 §4.1.3) — every uploaded list
    // enriches the customer-item ↔ Unite-SKU database.
    captureCrossReferences({ lines: result.lines, requestId: id, email: email.trim() });
    // "No quote returned" feedback loop (briefing §6): unmatched /
    // low-confidence lines are demand signals — never silently dropped.
    captureShortageListMisses({ lines: result.lines, customer_name: org.trim() || email.trim(), email: email.trim(), request_id: id });
    db.insert('leads', {
      id: uid('lead'),
      name: org.trim() || email.trim(),
      email: email.trim(),
      source: 'shortage-list',
      status: 'new',
      notes: `Shortage list ${id}: ${result.summary.total} lines / ${result.summary.sourcing} to quote${substitutes.trim() ? ' · approved substitutes provided' : ''}`,
    });
    setSubmittedId(id);
  }

  const chips = result ? [
    ['IN STOCK', result.summary.stocked, '#3b8760'],
    ['WE SOURCE', result.summary.source + result.summary.equivalent, D.terra],
    ['TO QUOTE', result.summary.sourcing, D.plum],
  ] : [];

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="NO EDI · NO PORTAL SETUP · NO FORMATTING"
        title="Paste your shortage list."
        sub="We instantly check each line against our stock, our vetted manufacturer network, and our sourcing desk — then come back with what we can supply and a quote for the rest."
      />

      <div id="main" style={{ padding: `${isMobile ? 32 : 64}px ${padX}px ${isMobile ? 64 : 110}px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Paste box */}
          <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 8, padding: isMobile ? 16 : 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>ONE ITEM PER LINE — SKU, HCPCS, OR PLAIN DESCRIPTION</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: D.ink, border: `1.5px solid ${D.ink}`, borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
                  Upload .csv / .txt
                  <input type="file" accept=".csv,.txt,.tsv" onChange={onUpload} style={{ display: 'none' }} />
                </label>
                <button onClick={() => setText(SAMPLE)} style={{ fontSize: 13, fontWeight: 500, color: D.ink2, background: 'none', border: `1px solid ${D.line}`, borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontFamily: D.sans }}>
                  Try a sample
                </button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'12 x nitrile exam gloves, large\nKGN-200 knee brace, qty 6\nflu test kits 25ct — 4 boxes'}
              rows={isMobile ? 7 : 9}
              style={{
                width: '100%', resize: 'vertical', boxSizing: 'border-box',
                background: D.paper, color: D.ink,
                border: `1px solid ${D.line}`, borderRadius: 14,
                padding: 16, fontFamily: D.mono, fontSize: 14, lineHeight: 1.7,
              }}
            />
          </div>

          {/* Live results */}
          {result && result.summary.total > 0 && (
            <div style={{ marginTop: isMobile ? 28 : 44 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 32, letterSpacing: -0.5 }}>
                  {result.summary.total} line{result.summary.total === 1 ? '' : 's'} read
                </span>
                {chips.map(([label, n, color]) => (
                  <span key={label} style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color, border: `1px solid ${D.line}`, background: D.card, borderRadius: 4, padding: '6px 13px' }}>
                    {n} {label}
                  </span>
                ))}
              </div>

              <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
                {result.lines.map((line, i) => (
                  <MatchRow key={`${i}-${line.raw}`} line={line} isMobile={isMobile} />
                ))}
              </div>

              {/* Submit for sourcing follow-up */}
              {submittedId ? (
                <div style={{ marginTop: 32, background: D.ink, color: D.paper, borderRadius: 8, padding: isMobile ? 24 : 36 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plumSoft }}>REQUEST RECEIVED · {submittedId.toUpperCase()}</div>
                  <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 32, marginTop: 10, letterSpacing: -0.5 }}>
                    Your list is with our sourcing desk.
                  </div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'rgba(243,242,235,.75)', maxWidth: 560 }}>
                    Stocked lines ship same-day on orders before 2pm EST. We&apos;ll come back on the
                    sourcing lines with landed-cost pricing from our vetted manufacturer network.
                  </p>
                  <Link to="/cart" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: D.paper, color: D.ink, padding: '12px 22px', borderRadius: 4, fontSize: 14, fontWeight: 600, marginTop: 8 }}>
                    Review cart <Icon.arrow />
                  </Link>
                </div>
              ) : (
                <form onSubmit={submit} style={{ marginTop: 32, background: D.card, border: `1px solid ${D.line}`, borderRadius: 8, padding: isMobile ? 18 : 28 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum, marginBottom: 14 }}>
                    SEND THE FULL LIST TO OUR SOURCING DESK
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto', gap: 10, alignItems: 'center' }}>
                    <input
                      type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="Work email"
                      style={{ padding: '13px 16px', border: `1px solid ${D.line}`, borderRadius: 12, background: D.paper, fontSize: 15 }}
                    />
                    <input
                      type="text" value={org} onChange={(e) => setOrg(e.target.value)}
                      placeholder="Organization (optional)"
                      style={{ padding: '13px 16px', border: `1px solid ${D.line}`, borderRadius: 12, background: D.paper, fontSize: 15 }}
                    />
                    <button type="submit" style={{ background: D.plum, color: D.paper, border: 'none', padding: '14px 26px', borderRadius: 4, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans, display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                      Submit list <Icon.arrow />
                    </button>
                  </div>
                  {/* Medical-safety guardrail (PRD-29 §4.1.4): the client
                      approves cross-SKUs up front — we don't guess. */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: D.ink }}>Acceptable substitutes (optional, recommended)</div>
                    <div style={{ fontSize: 12.5, color: D.ink3, marginTop: 4, lineHeight: 1.5 }}>
                      If your facility has pre-approved cross-SKUs or brands, list them here — we only
                      offer substitutes you&apos;ve signed off on, never keyword-match guesses.
                    </div>
                    <textarea
                      value={substitutes}
                      onChange={(e) => setSubstitutes(e.target.value)}
                      placeholder={'e.g. "Any nitrile exam glove, ASTM D6319" or "KGN-200 → your SKU UB-KNEE-01 OK"'}
                      rows={3}
                      style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, resize: 'vertical', background: D.paper, color: D.ink, border: `1px solid ${D.line}`, borderRadius: 12, padding: 12, fontFamily: D.sans, fontSize: 14, lineHeight: 1.6 }}
                    />
                  </div>
                  {error && <div style={{ marginTop: 10, fontSize: 13.5, color: D.terra }}>{error}</div>}
                  <div style={{ marginTop: 12, fontSize: 12.5, color: D.ink3 }}>
                    We respond within one business day. Your list is never shared.
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
