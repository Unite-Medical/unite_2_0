import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/lib/db.js';
test('imported products resolve by source identity and storefront SKU without changing their identity',()=>{
 db.clear();
 const product={id:'import_123',sku:'REAL-SKU',name:'Imported product'};
 db.insert('products',product);
 assert.equal(db.get('products','REAL-SKU').id,'import_123');
 assert.equal(db.get('products','import_123').sku,'REAL-SKU');
 db.update('products',db.get('products','REAL-SKU').id,{name:'Reviewed product'});
 assert.equal(db.list('products').length,1);
 assert.equal(db.get('products','REAL-SKU').name,'Reviewed product');
 db.insert('inventory',{id:'stock_123',sku:'REAL-SKU'});
 assert.equal(db.get('inventory','REAL-SKU'),null);
 db.clear();
});
