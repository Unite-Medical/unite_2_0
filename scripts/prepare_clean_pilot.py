import json,collections,hashlib,pathlib,copy
import argparse
parser=argparse.ArgumentParser(description='Build the reviewed September 8 staging test batch without changing source files.')
parser.add_argument('--snapshot',required=True,type=pathlib.Path)
parser.add_argument('--report',required=True,type=pathlib.Path)
args=parser.parse_args()
repo=pathlib.Path(__file__).resolve().parents[1]
x=json.load(open(args.snapshot))
S=lambda s:str(s or '').lstrip("'")
sk=collections.Counter(S(v['sku']) for v in x['variants'] if v['sku']);bc=collections.defaultdict(set)
for v in x['variants']:
 if v.get('barcode'):bc[S(v['barcode'])].add(S(v['sku']))
products=[];excluded=[];rows=[];skus=set();run='clean_pilot_20260923'
for p in x['products']:
 reasons=[]
 if p['status']!='active' or not p['shopify_published'] or p.get('launch_decision')!='Launch':reasons.append('Not active and approved for the current catalog')
 for v in p['variants']:
  if not S(v['sku']):reasons.append('Missing SKU')
  elif sk[S(v['sku'])]!=1:reasons.append('Duplicate SKU')
  if not (v.get('price') or 0)>0:reasons.append('Zero or missing price')
  if not (v.get('cogs') or 0)>0:reasons.append('Zero or missing cost')
  elif (v.get('price') or 0)<v['cogs']:reasons.append('Price below cost')
  if not (v.get('grams') or 0)>0:reasons.append('Missing shipping weight')
  if v.get('barcode') and len(bc[S(v['barcode'])])>1:reasons.append('Barcode used by different SKUs')
 if reasons:excluded.append({'handle':p['handle'],'name':p['name'],'reasons':sorted(set(reasons))});continue
 p=copy.deepcopy(p);p['id']=run+'_'+p['id'];p['sku']=S(p['sku']);p['barcode']=S(p.get('barcode')) or None
 p.update(staging_import_run=run,test_batch=True,source_date='2026-09-08',reconciliation_status='catalog_checks_passed_testing_only')
 for v in p['variants']:
  v.update(id=run+'_'+v['id'],product_id=p['id'],sku=S(v['sku']),barcode=S(v.get('barcode')) or None,staging_import_run=run,test_batch=True,source_date='2026-09-08')
  skus.add(v['sku']);rows.append({'table':'product_variants','id':v['id'],'data':v})
 products.append(p);rows.append({'table':'products','id':p['id'],'data':p})
locations=collections.Counter();inventory=[];held=[]
for i,r in enumerate(x['sources']['inventory']):
 if S(r['SKU']) not in skus:continue
 if r['Location']!='Unite Medical Warehouse':continue
 values=[r[k] for k in ['On hand (current)','Committed (not editable)','Unavailable (not editable)','Available (not editable)']]
 try:oh,comm,unavail,avail=map(int,values)
 except ValueError:held.append({'sku':S(r['SKU']),'reason':'Not stocked at Unite warehouse'});continue
 if min(oh,comm,unavail,avail)<0 or oh!=comm+unavail+avail:held.append({'sku':S(r['SKU']),'reason':'Negative or unbalanced stock; count required'});continue
 sku=S(r['SKU']);id=run+'_inv_'+sku
 data=dict(id=id,sku=sku,warehouse_id='wh_unite',on_hand=oh,reserved=comm+unavail,source_committed=comm,source_unavailable=unavail,reorder_at=0,inventory_owner_type='unite',inventory_owner_org_id=None,source='shopify_snapshot_2026_09_08',source_date='2026-09-08',staging_import_run=run,test_batch=True,reconciliation_status='physical_count_required')
 inventory.append(data);rows.append({'table':'inventory','id':id,'data':data})
 # The opening movement supports the stock ledger without claiming a physical receipt.
 if oh:
  mid=run+'_opening_'+sku
  rows.append({'table':'stock_movements','id':mid,'data':dict(id=mid,sku=sku,product_sku=sku,warehouse_id='wh_unite',qty_delta=oh,type='opening_balance',reason='Provisional Shopify export; physical count pending',occurred_at='2026-09-08T00:00:00Z',source_date='2026-09-08',source='shopify_snapshot_2026_09_08',staging_import_run=run,test_batch=True,inventory_owner_type='unite',inventory_owner_org_id=None)})
summary={'products':len(products),'variants':len(skus),'inventory_rows':len(inventory),'on_hand':sum(i['on_hand'] for i in inventory),'reserved':sum(i['reserved'] for i in inventory),'available':sum(i['on_hand']-i['reserved'] for i in inventory),'held_products':len(excluded),'held_inventory_rows':len(held)}
batch={'id':run,'source_date':'2026-09-08','source_sha256':x['sha256'],'summary':summary,'rows':rows,'held_inventory':held}
p=repo/'api/_data/cleanPilot.js';p.write_text('// Server-only reviewed subset. No customer or payment records.\nexport default '+json.dumps(batch,ensure_ascii=False,separators=(',',':'))+';\n')
report={'summary':summary,'source_date':'2026-09-08','selected_products':[{'name':p['name'],'sku':p['sku'],'variants':len(p['variants'])}for p in products],'held_products':excluded,'held_inventory':held}
args.report.write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps(summary));print('warehouses',collections.Counter(r['Location'] for r in x['sources']['inventory']));print('selected rows',len(rows))
