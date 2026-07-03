// Support / FAQ — section filters are functional per PRD-29 §6.4: every
// category has real FAQs and clicking a section filters the accordion.
import { useState } from 'react';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { FAQS, SUPPORT_SECTIONS, faqJsonLd } from '../data/faqs.js';

export function Support() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  const [section, setSection] = useState('All');
  const [open, setOpen] = useState(0);
  useSEO({
    title: 'Support — answers, not tickets',
    description:
      'Plain-language answers to the most common questions about ordering from Unite Medical: MOQs, shipping, billing, returns, compliance, EDI, private label.',
    canonical: '/support',
    jsonLd: [faqJsonLd()],
  });
  const faqs = FAQS.filter((f) => section === 'All' || f.section === section);
  const pick = (s) => { setSection(s); setOpen(0); };
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead eyebrow="HELP CENTER"
        title={<>Answers, <Grad>not tickets</Grad>.</>}
        sub="Common questions, plain-language answers. If we can't resolve it here, your rep will." />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `16px ${padX}px ${isMobile ? 56 : 64}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr', gap: isMobile ? 18 : 48 }}>
        <div className={isMobile ? 'um-scroll-x' : ''} style={isMobile ? { display: 'flex', gap: 6 } : undefined}>
          {['All', ...SUPPORT_SECTIONS].map((c) => {
            const active = section === c;
            return (
              <button
                key={c}
                onClick={() => pick(c)}
                style={{ display: 'block', width: isMobile ? 'auto' : '100%', textAlign: 'left', padding: isMobile ? '8px 14px' : '11px 14px', borderRadius: isMobile ? 999 : 8, fontSize: 13, fontFamily: D.sans, background: active ? D.plum : (isMobile ? D.card : 'transparent'), color: active ? D.paper : D.ink2, fontWeight: active ? 600 : 500, cursor: 'pointer', marginBottom: isMobile ? 0 : 2, border: isMobile ? `1px solid ${active ? D.plum : D.line}` : 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {c}
              </button>
            );
          })}
        </div>
        <div>
          {faqs.map((f, i) => (
            <div key={f.question} onClick={() => setOpen(open === i ? -1 : i)} style={{ borderTop: i === 0 ? `1px solid ${D.line}` : 'none', borderBottom: `1px solid ${D.line}`, padding: '22px 0', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.3, lineHeight: 1.2, color: D.ink, flex: 1 }}>{f.question}</div>
                <div style={{ fontFamily: D.mono, fontSize: 18, color: D.plum, marginLeft: 24 }}>{open === i ? '−' : '+'}</div>
              </div>
              {open === i && <div style={{ fontSize: 15, lineHeight: 1.6, color: D.ink2, marginTop: 14, maxWidth: 760 }}>{f.answer}</div>}
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
