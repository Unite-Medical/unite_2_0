import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { BLOG_IMG } from '../lib/imageMap.js';

export function Blog() {
  const navigate = useNavigate();
  const { isMobile, isTablet } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Field notes — market takes, compliance walkthroughs, ops notes',
    description:
      'Procurement intelligence, ASC operations, government contracting walkthroughs, and policy commentary from the people running an FDA-registered medical-supply distributor.',
    canonical: '/blog',
  });
  const allPosts = db.useTable('blog_posts', { where: { published: true }, orderBy: 'posted_at', dir: 'desc' });
  const cats = useMemo(() => ['All', ...new Set(allPosts.map((p) => p.category))], [allPosts]);
  const [cat, setCat] = useState('All');
  const posts = cat === 'All' ? allPosts : allPosts.filter((p) => p.category === cat);
  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead eyebrow="FIELD NOTES" title={<>The <em>journal</em>.</>} sub="Market takes, compliance walkthroughs, operational notes from the warehouse floor. Written by people who do the work." />
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `24px ${padX}px ${isMobile ? 56 : 80}px` }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
            {cats.map((t) => (
              <button key={t} onClick={() => setCat(t)} style={{ background: cat === t ? D.plum : D.card, color: cat === t ? D.paper : D.ink2, border: `1px solid ${cat === t ? D.plum : D.line}`, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontFamily: D.sans }}>{t}</button>
            ))}
          </div>

          {/* Friendly empty state (PRD-29 §6.2) — the blog is intentionally
              empty until real content lands; don't let it look broken. */}
          {posts.length === 0 && (
            <div style={{ padding: isMobile ? 40 : 64, textAlign: 'center', background: D.card, borderRadius: 14, border: `1px dashed ${D.line}` }}>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 32, letterSpacing: -0.5, color: D.ink }}>
                {allPosts.length === 0 ? 'Field notes coming soon.' : 'No posts in this category.'}
              </div>
              {allPosts.length === 0 && (
                <p style={{ fontSize: 14.5, color: D.ink2, margin: '12px auto 0', maxWidth: 460, lineHeight: 1.6 }}>
                  We&apos;re writing up market takes, compliance walkthroughs, and ops notes
                  from the warehouse floor. Check back shortly.
                </p>
              )}
            </div>
          )}

          {featured && (
            <article onClick={() => navigate(`/blog/${featured.slug}`)} className="um-card" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: isMobile ? 0 : 20, marginBottom: 28, background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, overflow: 'hidden', cursor: 'pointer' }}>
              <PhotoPlaceholder src={BLOG_IMG[featured.slug]} caption={featured.cover} height={isMobile ? 200 : 380} stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum} radius={0} />
              <div style={{ padding: isMobile ? 22 : 32, alignSelf: 'center' }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{featured.category.toUpperCase()} · {fmt.date(featured.posted_at).toUpperCase()} · {Math.max(3, Math.round((featured.body || '').length / 800))} MIN READ</div>
                <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.6vw, 44px)', fontWeight: 400, letterSpacing: -1, lineHeight: 1.08, marginTop: 14, color: D.ink }}>{featured.title}</h2>
                <p style={{ fontSize: 15, color: D.ink2, marginTop: 16, lineHeight: 1.6 }}>{featured.excerpt}</p>
                <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: D.ink }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: D.plum }} /> By {featured.author}
                </div>
              </div>
            </article>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : 'repeat(3,1fr)', gap: 14 }}>
            {rest.map((p) => (
              <article key={p.slug} onClick={() => navigate(`/blog/${p.slug}`)} className="um-card" style={{ background: D.card, borderRadius: 14, border: `1px solid ${D.line}`, overflow: 'hidden', cursor: 'pointer' }}>
                <PhotoPlaceholder src={BLOG_IMG[p.slug]} caption={p.cover} height={isMobile ? 160 : 180} stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum} radius={0} />
                <div style={{ padding: isMobile ? 18 : 22 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{p.category.toUpperCase()} · {fmt.date(p.posted_at).toUpperCase()}</div>
                  <h3 style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.4, lineHeight: 1.2, marginTop: 10, minHeight: isMobile ? 0 : 76, fontWeight: 400, color: D.ink }}>{p.title}</h3>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
