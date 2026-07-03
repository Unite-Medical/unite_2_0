/**
 * Resources · Coding reference — PRD-29 §6.3.7 (same real-data standard
 * as /resources).
 *
 * Shows only the HCPCS codes Unite SKUs actually bill under, sourced
 * from the curated cross-link map (src/data/hcpcsSkuMap.js) with
 * descriptions pulled live from the real CMS dataset. PDAC flags come
 * from product data, and every SKU links to its product page. Two
 * legacy fabrications were removed with the old hardcoded list: an
 * ankle brace listed under a walking-boot code and a surgical gown
 * under a mask code.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { HCPCS_SKU_MAP, skusForCode, productForSku } from '../data/hcpcsSkuMap.js';

export function CodingResources() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [descriptions, setDescriptions] = useState(null);

  useSEO({
    title: 'HCPCS coding reference for Unite Medical SKUs',
    description:
      'The HCPCS Level II codes Unite Medical products bill against, with official CMS descriptions. PDAC-approved SKUs flagged; every SKU links to its product page.',
    canonical: '/resources/coding',
  });

  useEffect(() => {
    let alive = true;
    import('../data/hcpcs.json')
      .then((m) => { if (alive) setDescriptions(new Map((m.default || m).codes)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => {
    return Object.keys(HCPCS_SKU_MAP).map((code) => {
      const skus = skusForCode(code).map((sku) => productForSku(sku)).filter(Boolean);
      return {
        code,
        desc: descriptions?.get(code) || '…',
        cat: skus[0]?.category || 'Supplies',
        pdac: skus.some((p) => p.pdac_approved),
        skus,
      };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [descriptions]);

  const cats = useMemo(() => ['All', ...new Set(rows.map((r) => r.cat))], [rows]);

  const filtered = useMemo(() =>
    rows.filter((r) =>
      (cat === 'All' || r.cat === cat) &&
      (!q || `${r.code} ${r.cat} ${r.desc} ${r.skus.map((p) => `${p.sku} ${p.name}`).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    ), [rows, q, cat]);

  const skuLinks = (r) => r.skus.map((p) => (
    <Link key={p.sku} to={`/products/${encodeURIComponent(p.sku)}`} style={{ fontFamily: D.mono, fontSize: 12, color: D.plum, textDecoration: 'none', display: 'block', padding: '1px 0' }}>
      {p.sku} →
    </Link>
  ));

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="RESOURCES · CODING REFERENCE"
          title={<>HCPCS, mapped to <Grad>our SKUs</Grad>.</>}
          sub="The HCPCS Level II codes our products bill against, with the official CMS descriptions. Click a SKU to open its product page — or browse the full code set on the HCPCS reference."
        />
        <section style={{ padding: `24px ${padX}px ${isMobile ? 56 : 96}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: `1px solid ${D.line}`, borderRadius: 4, background: D.card, flex: '1 1 320px', maxWidth: 480 }}>
                <Icon.search />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by code, SKU, or keyword (e.g. knee)"
                  aria-label="Search HCPCS codes"
                  style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 14, fontFamily: D.sans, color: D.ink }}
                />
              </div>
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)} style={{ background: cat === c ? D.plum : D.card, color: cat === c ? D.paper : D.ink2, border: `1px solid ${cat === c ? D.plum : D.line}`, padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontFamily: D.sans }}>{c}</button>
              ))}
              <Link to="/resources" style={{ marginLeft: 'auto', fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8, color: D.plum, textDecoration: 'none' }}>FULL HCPCS REFERENCE →</Link>
            </div>

            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {isMobile ? (
                <>
                  {filtered.map((r, i) => (
                    <div key={r.code} style={{ padding: '16px 18px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <div style={{ fontFamily: D.mono, fontWeight: 600, color: D.plum, fontSize: 14 }}>{r.code}</div>
                        {r.pdac && <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: '#3b8760' }}>PDAC</span>}
                      </div>
                      <div style={{ fontSize: 13, color: D.ink, marginTop: 6, lineHeight: 1.5 }}>{r.desc}</div>
                      <div style={{ fontSize: 12, color: D.ink2, marginTop: 8 }}>{r.cat}</div>
                      <div style={{ marginTop: 6 }}>{skuLinks(r)}</div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 160px 1fr 100px 180px', gap: 12, padding: '14px 20px', background: D.paperAlt, fontFamily: D.mono, fontSize: 11, letterSpacing: 1.1, color: D.ink3 }}>
                    <div>HCPCS</div><div>CATEGORY</div><div>CMS DESCRIPTION</div><div>PDAC</div><div>OUR SKUS</div>
                  </div>
                  {filtered.map((r, i) => (
                    <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '120px 160px 1fr 100px 180px', gap: 12, padding: '16px 20px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, alignItems: 'start', fontSize: 13.5 }}>
                      <div style={{ fontFamily: D.mono, fontWeight: 600, color: D.plum }}>{r.code}</div>
                      <div style={{ color: D.ink2 }}>{r.cat}</div>
                      <div style={{ lineHeight: 1.5 }}>{r.desc}</div>
                      <div>
                        {r.pdac ? <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: '#3b8760' }}>APPROVED</span> : <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>—</span>}
                      </div>
                      <div>{skuLinks(r)}</div>
                    </div>
                  ))}
                </>
              )}
              {filtered.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: D.ink3 }}>No codes match — try a different search.</div>
              )}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: D.ink3, lineHeight: 1.6 }}>
              Descriptions are the official CMS HCPCS Level II long descriptions. This table lists only codes with a verified Unite SKU cross-link — for the complete code set, use the <Link to="/resources" style={{ color: D.plum }}>full HCPCS reference</Link>.
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
