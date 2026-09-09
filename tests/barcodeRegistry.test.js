import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBarcodeRegistry,resolveBarcode,buildBarcodeCleanupQueue } from '../src/lib/barcodeRegistry.js';
import catalog from '../src/data/shopifyLaunchCatalog.generated.json' with {type:'json'};
import inventory from '../src/data/shopifyInventoryOpening.generated.json' with {type:'json'};

test('real catalog barcode registry reproduces missing and collision queues',()=>{
 const registry=buildBarcodeRegistry(catalog.products);
 assert.equal(registry.variant_count,451);assert.equal(registry.missing.length,186);assert.equal(registry.conflicts.length,6);
});

test('barcode resolver fails closed on conflict and preserves package conversion',()=>{
 const products=[{handle:'a',variants:[{sku:'A',barcode:'123',units_per_scan:10}]},{handle:'b',variants:[{sku:'B',barcode:'123',units_per_scan:1}]}];
 const registry=buildBarcodeRegistry(products);assert.equal(resolveBarcode(registry,'123').reason,'barcode_conflict');
 const single=buildBarcodeRegistry([{handle:'a',variants:[{sku:'A',barcode:'000123',units_per_scan:10}]}]);
 assert.deepEqual(resolveBarcode(single,'000123'),{ok:true,sku:'A',variant_id:'a:A',units_per_scan:10,packaging_level:'unknown',source:'shopify'});
});

test('unknown and inactive barcode never resolve to stock',()=>{
 const registry=buildBarcodeRegistry([{handle:'a',variants:[{sku:'A',barcode:'000123'}]}]);
 assert.equal(resolveBarcode(registry,'999').reason,'barcode_unknown');
 registry.identifiers[0].active=false;assert.equal(resolveBarcode(registry,'000123').reason,'barcode_inactive');
});

test('cleanup queue prioritizes the 80 launch variants with operational exposure',()=>{
 const queue=buildBarcodeCleanupQueue(catalog.products,inventory.rows);
 assert.equal(queue.filter((row)=>row.priority==='launch_operational').length,80);
 assert.equal(queue.length,186);
 assert.equal(queue[0].priority,'launch_operational');
});
