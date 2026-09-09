import fs from 'node:fs';
import { buildBarcodeCleanupQueue,buildBarcodeRegistry } from '../src/lib/barcodeRegistry.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../src/data/shopifyLaunchCatalog.generated.json',import.meta.url)));
const inventory=JSON.parse(fs.readFileSync(new URL('../src/data/shopifyInventoryOpening.generated.json',import.meta.url)));
const registry=buildBarcodeRegistry(catalog.products);const queue=buildBarcodeCleanupQueue(catalog.products,inventory.rows);
const payload={summary:{variants:registry.variant_count,mapped:registry.identifiers.length,missing:registry.missing.length,conflicts:registry.conflicts.length,launch_operational:queue.filter((row)=>row.priority==='launch_operational').length},conflicts:registry.conflicts,queue};
fs.writeFileSync(new URL('../src/data/barcodeReadiness.generated.json',import.meta.url),`${JSON.stringify(payload,null,2)}\n`);
console.log(JSON.stringify(payload.summary));
