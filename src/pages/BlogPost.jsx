import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO, articleSchema, breadcrumbSchema } from '../lib/seo.js';
import { BLOG_IMG } from '../lib/imageMap.js';

function MarkdownLite({ text = '' }) {
  const lines = text.split(/\n/);
  return (
    <>
      {lines.map((line, i) => {
        if (!line.trim()) return null;
        if (line.startsWith('# ')) return <h1 key={i} style={{ fontFamily: D.display, fontSize: 36, fontWeight: 400, letterSpacing: -0.7, margin: '32px 0 16px' }}>{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} style={{ fontFamily: D.display, fontSize: 28, letterSpacing: -0.5, margin: '32px 0 14px' }}>{line.slice(3)}</h2>;
        if (line.startsWith('- ')) return <li key={i} style={{ marginLeft: 22, lineHeight: 1.6 }}>{line.slice(2)}</li>;
        return <p key={i} style={{ margin: '14px 0', lineHeight: 1.7 }}>{line}</p>;
      })}
    </>
  );
}

export function BlogPost() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { isMobile } = useViewport();
  const padX = isMobile ? 22 : 40;
  const post = db.useRow('blog_posts', slug);

  useEffect(() => {
    if (post) db.update('blog_posts', post.id, { views: (post.views || 0) + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useSEO(post ? {
    title: post.title,
    description: post.excerpt,
    canonical: `/blog/${post.slug}`,
    type: 'article',
    jsonLd: [
      articleSchema(post),
      breadcrumbSchema([
        { name: 'Field notes', path: '/blog' },
        { name: post.title, path: `/blog/${post.slug}` },
      ]),
    ],
  } : { title: 'Post not found', noindex: true });

  if (!post) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: D.display, fontSize: 56, fontWeight: 400, letterSpacing: -1.2, lineHeight: 1, margin: 0 }}>Post not found.</h1>
          <button onClick={() => navigate('/blog')} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Back to journal</button>
        </main>
      </div>
    );
  }

  const readTime = Math.max(3, Math.round((post.body || '').length / 800));

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <div style={{ maxWidth: 760, margin: '0 auto', padding: `${isMobile ? 36 : 64}px ${padX}px ${isMobile ? 28 : 40}px` }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>{post.category.toUpperCase()} · {fmt.date(post.posted_at, { year: true }).toUpperCase()} · {readTime} MIN READ</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 6vw, 56px)', fontWeight: 400, letterSpacing: -1.4, lineHeight: 1.08, margin: '20px 0 24px' }}>{post.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 24, borderBottom: `1px solid ${D.line}` }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: D.plum }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{post.author}</div>
              <div style={{ fontSize: 12, color: D.ink2 }}>Unite Medical · {fmt.number(post.views || 0)} views</div>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 1180, margin: `0 auto ${isMobile ? 28 : 40}px`, padding: `0 ${padX}px` }}>
          <PhotoPlaceholder src={BLOG_IMG[post.slug]} caption={post.cover} height={isMobile ? 220 : 420} stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum} radius={isMobile ? 14 : 20} eager />
        </div>
        <article style={{ maxWidth: 720, margin: '0 auto', padding: `0 ${padX}px ${isMobile ? 56 : 80}px`, fontSize: isMobile ? 16 : 17, lineHeight: 1.7, color: D.ink }}>
          <p style={{ fontFamily: D.display, fontSize: 22, fontStyle: 'italic', color: D.ink2, borderLeft: `3px solid ${D.plum}`, paddingLeft: 22, margin: '0 0 32px' }}>
            {post.excerpt}
          </p>
          <MarkdownLite text={post.body} />
        </article>
      </main>
      <Footer />
    </div>
  );
}
