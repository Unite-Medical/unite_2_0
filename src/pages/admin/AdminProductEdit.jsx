import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button, ButtonLink } from '../../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { useSEO } from '../../lib/seo.js';
import '../../styles/ui.css';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { M6_CATEGORIES } from '../../lib/taxonomy.js';

const CATEGORIES = ['Orthotics', 'Diagnostics', 'PPE', 'Surgical', 'Supplements', 'Wound Care', 'Pharmaceuticals', 'Equipment'];
const TIERS = ['Bracing', 'POC', 'OTC', 'Consumable', 'Surgical', 'Wellness', 'Pharma', 'Equipment'];
const COUNTRIES = ['US', 'CN', 'VN', 'TW', 'IN', 'MX', 'DE'];
const TRACKING_LEVELS = [
  ['not_tracked', 'Not tracked'],
  ['optional', 'Optional'],
  ['required', 'Required'],
];

function emptyProduct() {
  return {
    id: '',
    sku: '',
    handle: '',
    name: '',
    vendor: 'Unite Medical®',
    category: 'Orthotics',
    m6_category: '', // required on new uploads (PRD-28 §5.6 / ties to A2)
    product_type: 'Orthopedic Devices',
    tier: '',
    pack_size: '1 ea',
    price: 0,
    price_min: 0,
    price_max: 0,
    cogs: 0,
    moq: 1,
    hcpcs: '—',
    summary: '',
    description: '',
    images: [],
    hero_image: '',
    tags: [],
    collections: [],
    variants: [],
    country_of_origin: '',
    fda_registered: false,
    pdac_approved: false,
    taa_compliant: false,
    berry_compliant: false,
    mspv_listed: false,
    latex_free: false,
    lot_tracking: 'optional',
    expiration_tracking: 'optional',
    serial_tracking: 'not_tracked',
    udi_tracking: 'not_tracked',
    available: true,
  };
}

export function AdminProductEdit() {
  const { sku } = useParams();
  // Keyed so going from /new to the saved product's URL starts a fresh editor.
  return <ProductEditor key={sku || 'new'} />;
}

function ProductEditor() {
  const location = useLocation();
  const back = location.state?.from === '/admin/inventory' ? '/admin/inventory' : '/admin/products';
  const { sku: rawSku } = useParams();
  const sku = rawSku === 'new' ? null : decodeURIComponent(rawSku || '');
  const navigate = useNavigate();
  const existing = sku ? db.useRow('products', sku) : null;
  const [form, setForm] = useState(() => existing ? { ...existing } : emptyProduct());
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [newImage, setNewImage] = useState('');
  useSEO({ title: `${existing ? existing.name || existing.sku : 'New product'} · Products`, noindex: true });

  useEffect(() => {
    if (existing && !dirty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({ ...existing });
    }
  }, [existing, dirty]);

  function patch(p) {
    setDirty(true);
    setSaved(false);
    setError('');
    setForm((f) => ({ ...f, ...p }));
  }

  function save() {
    if (!form.sku?.trim()) return setError('Add a SKU before saving.');
    // M6 taxonomy is a required classification on every new product (PRD-28 §5.6).
    if (!existing && !form.m6_category) return setError('Choose a product category before creating the product.');
    const payload = {
      ...form,
      id: existing?.id || form.sku,
      price: Number(form.price) || 0,
      price_min: Number(form.price_min || form.price) || 0,
      price_max: Number(form.price_max || form.price) || 0,
      moq: Number(form.moq) || 1,
      images: form.images || [],
      hero_image: form.hero_image || form.images?.[0] || '',
    };
    if (existing) {
      db.update('products', existing.id, payload);
    } else {
      db.insert('products', payload);
    }
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    if (!existing) navigate(`/admin/products/edit/${encodeURIComponent(payload.sku)}`, { replace: true, state: location.state });
  }

  function discard() {
    if (!dirty) return navigate(back);
    if (window.confirm('Discard unsaved changes?')) navigate(back);
  }

  function revert() {
    setForm(existing ? { ...existing } : emptyProduct());
    setDirty(false);
    setError('');
  }

  function setImages(list) {
    patch({ images: list, hero_image: list[0] || '' });
  }
  function moveImage(idx, dir) {
    const list = [...(form.images || [])];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    setImages(list);
  }
  function makeMain(idx) {
    const list = [...(form.images || [])];
    setImages([list[idx], ...list.filter((_, i) => i !== idx)]);
  }
  function addImage(e) {
    e.preventDefault();
    const url = newImage.trim();
    if (!url) return;
    setImages([...(form.images || []), url]);
    setNewImage('');
  }
  function setVariant(idx, p) {
    const list = [...(form.variants || [])];
    list[idx] = { ...list[idx], ...p };
    patch({ variants: list });
  }
  function removeVariant(idx) {
    patch({ variants: (form.variants || []).filter((_, i) => i !== idx) });
  }
  function addVariant() {
    patch({
      variants: [
        ...(form.variants || []),
        { variant_id: `v_${Date.now()}`, sku: '', title: 'New variant', price: form.price || 0, available: true, options: {}, image: '' },
      ],
    });
  }
  const tagsString = useMemo(() => (form.tags || []).join(', '), [form.tags]);
  const collectionsString = useMemo(() => (form.collections || []).join(', '), [form.collections]);
  const price = Number(form.price) || 0;
  const cost = Number(form.cogs) || 0;
  const profit = price > 0 && cost > 0 ? price - cost : null;

  if (sku && !existing) {
    return (
      <AdminShell active="products" unsavedChanges={dirty}>
        <main id="main" className="ui-root mx-auto w-full max-w-[1200px] px-4 py-10 font-sans text-sm text-ink md:px-8">
          <Card><CardContent className="py-10 text-center">
            <h1 className="m-0 font-display text-2xl font-semibold">We couldn’t find product {sku}.</h1>
            <p className="mt-2 text-ink-2">It may have been renamed or removed from the catalog.</p>
            <ButtonLink to={back} className="mt-4">Back to {back === '/admin/inventory' ? 'Inventory' : 'Products'}</ButtonLink>
          </CardContent></Card>
        </main>
      </AdminShell>
    );
  }
  const images = form.images || [];
  return (
    <AdminShell active="products" unsavedChanges={dirty}>
      <main id="main" className="ui-root mx-auto w-full max-w-[1200px] px-4 pb-16 pt-4 font-sans text-sm text-ink md:px-8">
        {dirty && (
          <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-deep px-4 py-3 text-white shadow-xs" role="status">
            <span className="font-semibold">Unsaved changes</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={revert}>Discard</Button>
              <Button variant="primary" onClick={save}>{existing ? 'Save' : 'Create product'}</Button>
            </div>
          </div>
        )}
        <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={discard} className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-ink-2 hover:text-ink md:min-h-0">
              <ArrowLeft size={16} aria-hidden="true" /> {back === '/admin/inventory' ? 'Inventory' : 'Products'}
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 font-display text-2xl font-semibold leading-tight md:text-[28px]">{existing ? form.name || form.sku : 'New product'}</h1>
              {existing && <Badge tone={form.available ? 'good' : 'neutral'} dot>{form.available ? 'Active' : 'Draft'}</Badge>}
              {saved && <Badge tone="good">Saved</Badge>}
            </div>
            <p className="m-0 mt-1 text-ink-2">{existing ? [existing.sku, existing.product_type].filter(Boolean).join(' · ') : 'Add a new product to the catalog'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {existing && (
              <ButtonLink to={`/products/${encodeURIComponent(existing.sku)}`} target="_blank" rel="noreferrer">
                <ExternalLink size={16} aria-hidden="true" /> View on store
              </ButtonLink>
            )}
            <Button variant="primary" onClick={save} disabled={!dirty && !!existing}>{existing ? 'Save' : 'Create product'}</Button>
          </div>
        </header>
        {error && <p role="alert" className="mb-4 rounded-lg border border-warn-soft bg-[#f8ede4] px-4 py-3 text-warn">{error}</p>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid content-start gap-5">
            <Section title="Title and description">
              <Field label="Title"><input value={form.name || ''} onChange={(e) => patch({ name: e.target.value })} className={inputCls} /></Field>
              <Field label="Short summary" hint="One line, shown on product cards.">
                <input value={form.summary || ''} onChange={(e) => patch({ summary: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Description">
                <textarea value={form.description || ''} onChange={(e) => patch({ description: e.target.value })} rows={8} className={`${inputCls} h-auto py-2.5 leading-relaxed`} placeholder="Manufacturer copy, key features, billing notes" />
              </Field>
            </Section>

            <Section title={`Media${images.length ? ` (${images.length})` : ''}`}>
              {images.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-paper text-ink-2">
                  <ImagePlus size={22} aria-hidden="true" /> No images yet. Add an image link below.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {images.map((src, i) => (
                    <figure key={`${src}-${i}`} className={`m-0 overflow-hidden rounded-lg border bg-white ${i === 0 ? 'col-span-2 row-span-2 border-brand' : 'border-line'}`}>
                      <div className="relative">
                        <img src={src} alt="" className={`block w-full object-contain ${i === 0 ? 'h-72' : 'h-32'}`} />
                        {i === 0 && <span className="absolute left-2 top-2"><Badge tone="good">Main image</Badge></span>}
                      </div>
                      <figcaption className="flex items-center justify-between gap-1 border-t border-line bg-card px-1.5 py-1">
                        <span className="flex">
                          <Button variant="ghost" size="icon" aria-label="Move image earlier" disabled={i === 0} onClick={() => moveImage(i, -1)}><ChevronLeft size={16} /></Button>
                          <Button variant="ghost" size="icon" aria-label="Move image later" disabled={i === images.length - 1} onClick={() => moveImage(i, 1)}><ChevronRight size={16} /></Button>
                        </span>
                        <span className="flex">
                          {i > 0 && <Button variant="ghost" size="icon" aria-label="Make main image" onClick={() => makeMain(i)}><Star size={16} /></Button>}
                          <Button variant="ghost" size="icon" aria-label="Remove image" onClick={() => setImages(images.filter((_, j) => j !== i))}><Trash2 size={16} /></Button>
                        </span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <form onSubmit={addImage} className="flex gap-2">
                <input value={newImage} onChange={(e) => setNewImage(e.target.value)} placeholder="Image link, e.g. https://… or /images/products/…" aria-label="Image link" className={inputCls} />
                <Button type="submit" disabled={!newImage.trim()}><Plus size={16} aria-hidden="true" /> Add</Button>
              </form>
            </Section>

            <Section title="Pricing">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Price"><Money value={form.price} onChange={(v) => patch({ price: v })} /></Field>
                <Field label="Cost per item" hint="Customers won’t see this."><Money value={form.cogs} onChange={(v) => patch({ cogs: v })} /></Field>
                <Field label="Lowest price"><Money value={form.price_min} onChange={(v) => patch({ price_min: v })} /></Field>
                <Field label="Highest price"><Money value={form.price_max} onChange={(v) => patch({ price_max: v })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-paper px-4 py-3">
                <div><div className="text-ink-2">Profit</div><div className="font-display text-lg font-semibold">{profit == null ? '—' : fmt.money(profit)}</div></div>
                <div><div className="text-ink-2">Margin</div><div className={`font-display text-lg font-semibold ${profit != null && profit < 0 ? 'text-warn' : ''}`}>{profit == null ? '—' : `${Math.round((profit / price) * 100)}%`}</div></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Minimum order quantity"><input type="number" min="1" value={form.moq ?? 1} onChange={(e) => patch({ moq: e.target.value })} className={inputCls} /></Field>
                <Field label="Pack size"><input value={form.pack_size || ''} onChange={(e) => patch({ pack_size: e.target.value })} placeholder="e.g. 100/box" className={inputCls} /></Field>
              </div>
            </Section>

            <Section title={`Variants${form.variants?.length ? ` (${form.variants.length})` : ''}`} action={<Button size="sm" onClick={addVariant}><Plus size={16} aria-hidden="true" /> Add variant</Button>}>
              {!form.variants?.length ? (
                <p className="m-0 text-ink-2">No variants. This product sells at the price above.</p>
              ) : (
                <div className="grid gap-3">
                  {form.variants.map((v, i) => (
                    <div key={v.variant_id || i} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_120px_auto] sm:items-end">
                      <Field label="Option name"><input value={v.title || ''} onChange={(e) => setVariant(i, { title: e.target.value })} className={inputCls} /></Field>
                      <Field label="SKU"><input value={v.sku || ''} onChange={(e) => setVariant(i, { sku: e.target.value })} className={`${inputCls} font-mono`} /></Field>
                      <Field label="Price"><Money value={v.price} onChange={(val) => setVariant(i, { price: parseFloat(val) || 0 })} /></Field>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-ink-2">
                          <input type="checkbox" className="size-5 accent-[#1d5c4d]" checked={!!v.available} onChange={(e) => setVariant(i, { available: e.target.checked })} /> In stock
                        </label>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${v.title || 'variant'}`} onClick={() => removeVariant(i)}><Trash2 size={16} /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="grid content-start gap-5">
            <Section title="Status">
              <select value={form.available ? 'active' : 'draft'} onChange={(e) => patch({ available: e.target.value === 'active' })} className={inputCls} aria-label="Product status">
                <option value="active">Active: customers can buy it</option>
                <option value="draft">Draft: hidden from purchase</option>
              </select>
            </Section>

            <Section title="Organization">
              <Field label={existing ? 'Product category' : 'Product category (required)'}>
                <select value={form.m6_category || ''} onChange={(e) => patch({ m6_category: e.target.value })} className={inputCls}>
                  <option value="" disabled>Choose a category…</option>
                  {M6_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Vendor"><input value={form.vendor || ''} onChange={(e) => patch({ vendor: e.target.value })} className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select value={form.category || ''} onChange={(e) => patch({ category: e.target.value })} className={inputCls}>
                    <option value="">Not set</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Tier">
                  <select value={form.tier || ''} onChange={(e) => patch({ tier: e.target.value })} className={inputCls}>
                    <option value="">Not set</option>{TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Tags" hint="Separate with commas.">
                <input value={tagsString} onChange={(e) => patch({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="ortho, recovery, knee brace" className={inputCls} />
              </Field>
              <Field label="Collections" hint="Separate with commas.">
                <input value={collectionsString} onChange={(e) => patch({ collections: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Knee Braces, Orthopedic Bracing" className={inputCls} />
              </Field>
            </Section>

            <Section title="Identifiers">
              <Field label="SKU" hint={existing ? 'Can’t be changed, so stock stays linked.' : undefined}>
                <input readOnly={Boolean(existing)} value={form.sku || ''} onChange={(e) => patch({ sku: e.target.value, id: e.target.value })} className={`${inputCls} font-mono ${existing ? 'bg-paper text-ink-2' : ''}`} />
              </Field>
              <Field label="Web address" hint="Leave blank to use the title."><input value={form.handle || ''} onChange={(e) => patch({ handle: e.target.value })} className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="HCPCS code"><input value={form.hcpcs || ''} onChange={(e) => patch({ hcpcs: e.target.value })} className={inputCls} /></Field>
                <Field label="Made in">
                  <select value={form.country_of_origin || ''} onChange={(e) => patch({ country_of_origin: e.target.value })} className={inputCls}>
                    <option value="">Not set</option>{COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
            </Section>

            <Section title="Compliance">
              <div className="grid">
                {[
                  ['fda_registered', 'FDA registered'],
                  ['pdac_approved', 'PDAC approved'],
                  ['taa_compliant', 'TAA compliant'],
                  ['berry_compliant', 'Berry compliant'],
                  ['mspv_listed', 'MSPV listed'],
                  ['latex_free', 'Latex-free'],
                ].map(([key, label]) => (
                  <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 text-ink">
                    <input type="checkbox" className="size-5 accent-[#1d5c4d]" checked={!!form[key]} onChange={(e) => patch({ [key]: e.target.checked })} /> {label}
                  </label>
                ))}
              </div>
            </Section>

            <Section title="Warehouse tracking">
              <p className="m-0 text-ink-2">“Required” blocks receiving and shipping until the warehouse records it.</p>
              {[
                ['lot_tracking', 'Lot number'],
                ['expiration_tracking', 'Expiration date'],
                ['serial_tracking', 'Serial number'],
                ['udi_tracking', 'UDI'],
              ].map(([key, label]) => (
                <div key={key} className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-3">
                  <span>{label}</span>
                  <select aria-label={label} value={form[key] || 'not_tracked'} onChange={(e) => patch({ [key]: e.target.value })} className={inputCls}>
                    {TRACKING_LEVELS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                  </select>
                </div>
              ))}
            </Section>

            {existing && (
              <Section title="At a glance">
                <dl className="m-0 grid">
                  <Stat label="Variants" value={String(existing.variants?.length || 1)} />
                  <Stat label="Images" value={String(existing.images?.length || 0)} />
                  <Stat label="In stock (all variants)" value={fmt.number(db.list('inventory').filter(r=>(existing.variants?.length?existing.variants:[existing]).some(v=>v.sku===r.sku)&&(r.inventory_owner_type||'unite')==='unite'&&!r.inventory_owner_org_id).reduce((a,b)=>a+Number(b.on_hand||0),0))} />
                  <Stat label="Order lines" value={String(db.list('order_items', { where: { sku: existing.sku } }).length)} />
                </dl>
              </Section>
            )}
          </div>
        </div>
      </main>
    </AdminShell>
  );
}

const inputCls = 'h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none focus:border-brand md:h-10';

function Section({ title, action, children }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{action}</CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="grid content-start gap-1.5">
      <span className="font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-2">{hint}</span>}
    </label>
  );
}

function Money({ value, onChange }) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">$</span>
      <input type="number" step="0.01" min="0" value={value ?? 0} onChange={(e) => onChange(e.target.value)} className={`${inputCls} pl-7`} />
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line py-2 first:border-t-0">
      <dt className="text-ink-2">{label}</dt>
      <dd className="m-0 font-semibold">{value}</dd>
    </div>
  );
}
