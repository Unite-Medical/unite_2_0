import { useMemo, useState } from 'react';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const CODES = [
  { code: 'L1832', cat: 'Orthotics · Knee',     desc: 'Knee orthosis (KO), adjustable knee joints, positional orthosis, off-the-shelf.',                       billable: true,  pdac: true,  ours: 'KO3233' },
  { code: 'L4361', cat: 'Orthotics · Ankle',    desc: 'Walking boot, pneumatic, with or without joints.',                                                          billable: true,  pdac: true,  ours: 'VA1S50S' },
  { code: 'L3908', cat: 'Orthotics · Wrist',    desc: 'Wrist hand orthosis, includes one or more nontorsion joints.',                                              billable: true,  pdac: true,  ours: 'WHO1615-SM' },
  { code: 'L0180', cat: 'Orthotics · Cervical', desc: 'Cervical, multiple post collar, occipital/mandibular supports, adjustable.',                                billable: true,  pdac: false, ours: 'CC180' },
  { code: 'A4927', cat: 'Supplies',             desc: 'Gloves, non-sterile, per 100.',                                                                              billable: true,  pdac: false, ours: 'APN-3001-C' },
  { code: 'A4928', cat: 'Supplies',             desc: 'Surgical mask, per 20.',                                                                                      billable: true,  pdac: false, ours: '7678383' },
  { code: 'A6234', cat: 'Wound Care',           desc: 'Hydrocolloid dressing, wound cover, sterile, pad size 16 sq. in. or less.',                                  billable: true,  pdac: false, ours: '—' },
  { code: 'A6212', cat: 'Wound Care',           desc: 'Foam dressing, wound cover, sterile, pad size more than 16 sq. in. but less than 48.',                       billable: true,  pdac: false, ours: '—' },
  { code: 'E0445', cat: 'Equipment',            desc: 'Oximeter device for measuring blood oxygen levels non-invasively.',                                          billable: true,  pdac: false, ours: '—' },
  { code: 'E1399', cat: 'Equipment',            desc: 'Durable medical equipment, miscellaneous.',                                                                  billable: true,  pdac: false, ours: '—' },
];

export function CodingResources() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  const [q, setQ] = useState('');
  useSEO({
    title: 'HCPCS coding reference for Unite Medical SKUs',
    description:
      'Quick lookup of the HCPCS Level II codes Unite Medical products bill against. Search by code, name, or keyword. PDAC-approved L-codes flagged.',
    canonical: '/resources/coding',
  });
  const [cat, setCat] = useState('All');
  const cats = useMemo(() => ['All', ...new Set(CODES.map((c) => c.cat))], []);

  const filtered = useMemo(() =>
    CODES.filter((c) =>
      (cat === 'All' || c.cat === cat) &&
      (!q || `${c.code} ${c.cat} ${c.desc}`.toLowerCase().includes(q.toLowerCase()))
    ), [q, cat]);

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="RESOURCES · CODING REFERENCE"
          title={<>HCPCS, mapped to <Grad>our SKUs</Grad>.</>}
          sub="Quick lookup of the HCPCS codes our products bill against. Click a code to add the matching SKU to a quote."
        />
        <section style={{ padding: `24px ${padX}px ${isMobile ? 56 : 96}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: `1px solid ${D.line}`, borderRadius: 999, background: D.card, flex: '1 1 320px', maxWidth: 480 }}>
                <Icon.search />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by code, name, or keyword (e.g. knee)"
                  aria-label="Search HCPCS codes"
                  style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 14, fontFamily: D.sans, color: D.ink }}
                />
              </div>
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)} style={{ background: cat === c ? D.plum : D.card, color: cat === c ? D.paper : D.ink2, border: `1px solid ${cat === c ? D.plum : D.line}`, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontFamily: D.sans }}>{c}</button>
              ))}
            </div>

            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {isMobile ? (
                <>
                  {filtered.map((c, i) => (
                    <div key={c.code} style={{ padding: '16px 18px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <div style={{ fontFamily: D.mono, fontWeight: 600, color: D.plum, fontSize: 14 }}>{c.code}</div>
                        {c.pdac && <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: '#3b8760' }}>PDAC</span>}
                      </div>
                      <div style={{ fontSize: 13, color: D.ink, marginTop: 6, lineHeight: 1.5 }}>{c.desc}</div>
                      <div style={{ fontSize: 12, color: D.ink2, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{c.cat}</span>
                        <span style={{ fontFamily: D.mono }}>{c.ours}</span>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 160px 1fr 100px 140px', gap: 12, padding: '14px 20px', background: D.paperAlt, fontFamily: D.mono, fontSize: 11, letterSpacing: 1.1, color: D.ink3 }}>
                    <div>HCPCS</div><div>CATEGORY</div><div>DESCRIPTION</div><div>PDAC</div><div>OUR SKU</div>
                  </div>
                  {filtered.map((c, i) => (
                    <div key={c.code} style={{ display: 'grid', gridTemplateColumns: '120px 160px 1fr 100px 140px', gap: 12, padding: '16px 20px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, alignItems: 'center', fontSize: 13.5 }}>
                      <div style={{ fontFamily: D.mono, fontWeight: 600, color: D.plum }}>{c.code}</div>
                      <div style={{ color: D.ink2 }}>{c.cat}</div>
                      <div>{c.desc}</div>
                      <div>
                        {c.pdac ? <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: '#3b8760' }}>APPROVED</span> : <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>—</span>}
                      </div>
                      <div style={{ fontFamily: D.mono, fontSize: 12, color: D.ink2 }}>{c.ours}</div>
                    </div>
                  ))}
                </>
              )}
              {filtered.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: D.ink3 }}>No codes match — try a different search.</div>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
