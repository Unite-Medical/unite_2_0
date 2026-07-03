import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt, uid } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';

export function AdminCMS() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const pages = db.useTable('cms_pages', { orderBy: 'updated_at', dir: 'desc' });
  const posts = db.useTable('blog_posts', { orderBy: 'posted_at', dir: 'desc' });
  const banners = db.useTable('banners');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', excerpt: '', body: '', category: 'Procurement' });

  function startNew() {
    setEditing('new');
    setForm({ title: '', excerpt: '', body: '', category: 'Procurement' });
  }

  function startEdit(post) {
    setEditing(post.id);
    setForm({ title: post.title, excerpt: post.excerpt, body: post.body, category: post.category });
  }

  function save() {
    if (editing === 'new') {
      const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+|-$/g, '') || uid('post').slice(5);
      db.insert('blog_posts', { id: slug, slug, title: form.title, excerpt: form.excerpt, body: form.body, category: form.category, author: 'You', cover: 'newsroom', published: true, views: 0, posted_at: new Date().toISOString() });
    } else if (editing) {
      db.update('blog_posts', editing, { title: form.title, excerpt: form.excerpt, body: form.body, category: form.category });
    }
    setEditing(null);
  }

  function togglePublish(post) {
    db.update('blog_posts', post.id, { published: !post.published });
  }

  function togglePage(p) {
    db.update('cms_pages', p.id, { published: !p.published });
  }

  function toggleBanner(b) {
    db.update('banners', b.id, { active: !b.active });
  }

  return (
    <AdminShell active="cms">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 24 : 32}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>CONTENT · CMS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Content & pages.</h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={startNew} style={{ background: D.plum, color: D.paper, border: 'none', padding: '10px 18px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>+ New blog post</button>
          </div>
        </div>
      </div>
      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: 20 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 20, letterSpacing: -0.3 }}>Static pages · {pages.length}</div>
            <div className={isMobile ? 'um-scroll-x' : ''}>
            {pages.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 80px', minWidth: isMobile ? 600 : 'auto', padding: '12px 20px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, fontSize: 13, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.title}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>{p.slug}</div>
                </div>
                <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink2 }}>{fmt.number(p.views)}</div>
                <div style={{ color: D.ink2, fontSize: 12 }}>{fmt.ago(p.updated_at)}</div>
                <div>
                  <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '3px 10px', borderRadius: 4, background: p.published ? 'rgba(29,92,77,.1)' : D.terraSoft, color: p.published ? D.plum : D.terra }}>{p.published ? 'PUBLISHED' : 'DRAFT'}</span>
                </div>
                <button onClick={() => togglePage(p)} style={{ background: 'transparent', color: D.ink2, border: 'none', cursor: 'pointer', fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8 }}>TOGGLE</button>
              </div>
            ))}
            </div>
          </div>
          <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 20, letterSpacing: -0.3 }}>Blog posts · {posts.length}</div>
            <div className={isMobile ? 'um-scroll-x' : ''}>
            {posts.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px 80px', minWidth: isMobile ? 640 : 'auto', padding: '12px 20px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, fontSize: 13, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.title}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>{p.category} · {p.author}</div>
                </div>
                <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink2 }}>{fmt.number(p.views)} views</div>
                <div style={{ color: D.ink2, fontSize: 12 }}>{fmt.date(p.posted_at)}</div>
                <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '3px 10px', borderRadius: 4, background: p.published ? 'rgba(29,92,77,.1)' : D.terraSoft, color: p.published ? D.plum : D.terra }}>{p.published ? 'LIVE' : 'DRAFT'}</span>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => startEdit(p)} style={{ background: 'transparent', color: D.plum, border: 'none', cursor: 'pointer', fontFamily: D.mono, fontSize: 11 }}>EDIT</button>
                  <button onClick={() => togglePublish(p)} style={{ background: 'transparent', color: D.ink2, border: 'none', cursor: 'pointer', fontFamily: D.mono, fontSize: 11 }}>{p.published ? 'UNPUB' : 'PUB'}</button>
                </div>
              </div>
            ))}
            </div>
          </div>
          <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 20, letterSpacing: -0.3 }}>Marketing banners · {banners.length}</div>
            <div className={isMobile ? 'um-scroll-x' : ''}>
            {banners.map((b, i) => (
              <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 80px', minWidth: isMobile ? 540 : 'auto', padding: '12px 20px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, fontSize: 13, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{b.headline}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>{b.placement}</div>
                </div>
                <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink2 }}>{b.clicks} clicks</div>
                <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '3px 10px', borderRadius: 4, background: b.active ? 'rgba(29,92,77,.1)' : D.terraSoft, color: b.active ? D.plum : D.terra }}>{b.active ? 'ACTIVE' : 'PAUSED'}</span>
                <button onClick={() => toggleBanner(b)} style={{ background: 'transparent', color: D.plum, border: 'none', cursor: 'pointer', fontFamily: D.mono, fontSize: 11 }}>{b.active ? 'PAUSE' : 'ACTIVATE'}</button>
              </div>
            ))}
            </div>
          </div>
        </div>

        <div>
          <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, padding: isMobile ? 20 : 24, position: isMobile ? 'static' : 'sticky', top: 24 }}>
            <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.3 }}>{editing === 'new' ? 'New post' : editing ? 'Edit post' : 'Editor'}</div>
            {!editing && <p style={{ color: D.ink2, fontSize: 13, marginTop: 12 }}>Click EDIT on a post or hit &quot;+ New&quot; to start.</p>}
            {editing && (
              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                <Field label="Title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
                <Field label="Category" value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
                <Field label="Excerpt" value={form.excerpt} onChange={(v) => setForm((f) => ({ ...f, excerpt: v }))} />
                <label>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>BODY (MARKDOWN)</div>
                  <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={10} style={{ marginTop: 6, width: '100%', padding: 12, background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 13, color: D.ink, fontFamily: D.mono, outline: 'none', resize: 'vertical' }} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={save} style={{ background: D.plum, color: D.paper, border: 'none', padding: '10px 18px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditing(null)} style={{ background: 'transparent', color: D.ink2, border: `1px solid ${D.line}`, padding: '10px 18px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label.toUpperCase()}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 6, width: '100%', padding: '10px 12px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 13, color: D.ink, outline: 'none', fontFamily: D.sans }} />
    </label>
  );
}
