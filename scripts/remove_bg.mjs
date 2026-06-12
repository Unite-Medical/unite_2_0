#!/usr/bin/env node
/**
 * Product cutouts via remove.bg — strips backgrounds from catalog hero
 * images so cards can float the product over styled backdrops.
 *
 *   REMOVE_BG_API_KEY=... node scripts/remove_bg.mjs            # rail + first 30
 *   REMOVE_BG_API_KEY=... node scripts/remove_bg.mjs --limit 50
 *   REMOVE_BG_API_KEY=... node scripts/remove_bg.mjs --all
 *
 * - Homepage rail products are processed first, then catalog order.
 * - Already-processed SKUs are skipped (delete the PNG to redo one).
 * - Results land in public/images/products/cutouts/<sku>.png and the
 *   manifest src/data/productCutouts.json (what the app reads).
 * - Stops cleanly when the API runs out of credits (HTTP 402).
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REAL_PRODUCTS } from '../src/data/realCatalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'products', 'cutouts');
const MANIFEST = path.join(ROOT, 'src', 'data', 'productCutouts.json');

const API_KEY = process.env.REMOVE_BG_API_KEY;
if (!API_KEY) {
  console.error('REMOVE_BG_API_KEY env var is required.');
  process.exit(1);
}
const ALL = process.argv.includes('--all');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = ALL ? Infinity : limitArg > -1 ? Number(process.argv[limitArg + 1]) : 30;

// Same priority order as the homepage rail (src/data/index.js).
const FEATURED_HANDLES = [
  'universal-rom-knee-brace',
  'welllife-influenza-rapid-antigen-test-professional-25',
  'avina-pure-4-mil-blue-nitrile-examination-gloves',
  'megasporebiotic-gummies-adults',
];

function orderedProducts() {
  const featured = FEATURED_HANDLES
    .map((h) => REAL_PRODUCTS.find((p) => p.handle === h))
    .filter(Boolean);
  const rest = REAL_PRODUCTS.filter((p) => !featured.includes(p));
  return [...featured, ...rest].filter((p) => p.sku && p.hero_image);
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function loadManifest() {
  try { return JSON.parse(await readFile(MANIFEST, 'utf8')); } catch { return {}; }
}

async function removeBg(imageUrl) {
  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      size: 'preview',   // free-tier size; plenty for ~640px card slots
      format: 'png',
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status}: ${detail.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = await loadManifest();
  const products = orderedProducts();

  let done = 0;
  let skipped = 0;

  for (const p of products) {
    if (done >= LIMIT) break;
    const outFile = path.join(OUT_DIR, `${p.sku}.png`);
    const publicPath = `/images/products/cutouts/${p.sku}.png`;

    if (await exists(outFile)) {
      manifest[p.sku] = publicPath;
      skipped += 1;
      continue;
    }

    try {
      const png = await removeBg(p.hero_image);
      await writeFile(outFile, png);
      manifest[p.sku] = publicPath;
      done += 1;
      console.log(`  + ${p.sku} (${(png.length / 1024).toFixed(0)} KB) — ${p.name.slice(0, 60)}`);
    } catch (err) {
      if (err.status === 402 || err.status === 429) {
        console.error(`  ! API limit reached (${err.status}) — stopping. Processed ${done} this run.`);
        break;
      }
      console.error(`  ! ${p.sku} failed: ${err.message}`);
    }
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Done — ${done} new cutouts, ${skipped} already existed, manifest has ${Object.keys(manifest).length} SKUs.`);
}

main();
