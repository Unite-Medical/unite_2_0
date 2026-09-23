import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PUBLIC_CATALOG } from '../src/data/publicCatalog.generated.js';
import { seed as seedPublicDatabase } from '../src/lib/publicSeed.js';
import { db } from '../src/lib/db.js';

const FORBIDDEN_KEY = /(^|_)(price|cost|cogs|margin|discount|vendor_price|contract_price)($|_)/i;

function walk(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, [...path, index]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    assert.equal(FORBIDDEN_KEY.test(key), false, `forbidden public key ${[...path, key].join('.')}`);
    walk(entry, [...path, key]);
  }
}

test('generated public catalog contains product information but no price or internal economics at any nesting level', () => {
  assert.ok(PUBLIC_CATALOG.products.length > 0);
  walk(PUBLIC_CATALOG);
  const serialized = JSON.stringify(PUBLIC_CATALOG);
  for (const marker of ['org_atlsurgical', 'cart_demo', 'usr_demo', 'sarah@atlanta-surgical.com', 'ops@medone.example']) {
    assert.equal(serialized.includes(marker), false, marker);
  }
});

test('production seed initializes only public catalog projections and no commerce fixtures', () => {
  const database = {
    categories: [], products: [], product_variants: [], inventory: [], cms_pages: [],
    profiles: [], organizations: [], carts: [], cart_items: [], orders: [], order_items: [],
    invoices: [], pricing: [], customer_contract_prices: [], account_payment_methods: [],
  };
  seedPublicDatabase(database);
  assert.equal(database.products.length, PUBLIC_CATALOG.products.length);
  assert.equal(database.profiles.length, 0);
  assert.equal(database.organizations.length, 0);
  assert.equal(database.orders.length, 0);
  assert.equal(database.invoices.length, 0);
  assert.equal(database.pricing.length, 0);
  assert.equal(database.customer_contract_prices.length, 0);
  assert.equal(database.account_payment_methods.length, 0);
  assert.ok(database.inventory.every((row) => row.public_projection === true && [0, 1].includes(row.on_hand)));
  walk(database.products);
  walk(database.product_variants);
});

test('authorization purge retains only the sanitized public projection', () => {
  db.insert('orders', { id: 'secret_order', customer_po: 'SECRET-PO' });
  db.insert('profiles', { id: 'secret_admin', role: 'admin' });
  db.clearPublic();
  assert.equal(db.count('products'), PUBLIC_CATALOG.products.length);
  assert.equal(db.count('orders'), 0);
  assert.equal(db.count('profiles'), 0);
  assert.equal(db.list('inventory').every((row) => row.public_projection === true), true);
});

test('anonymous product detail omits freight prices, warehouse quantities, and retired hub claims', async () => {
  const source = await readFile(new URL('../src/pages/ProductDetail.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /orders over \$500|STOCK BY WAREHOUSE|on_hand\.toLocaleString|RNO hub|DAL hub/);
  assert.match(source, /Exact stock counts, reservations, and allocation details remain private/);
  assert.match(source, /Lithia Springs, Georgia/);
});
