#!/usr/bin/env python3
"""Read the supplied Shopify snapshot, retain all source rows, prepare staging data.

Output contains private customer data and must stay in migration-data/.
This command does not contact Shopify or write to a database.
"""
import csv, hashlib, html, io, json, re, sys, zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
downloads=Path(sys.argv[1])
open_path=Path(sys.argv[2])
out=root/'migration-data'
out.mkdir(exist_ok=True,mode=0o700)
paths={'products':downloads/'products_export_1 (2).csv','inventory':downloads/'inventory_export_1 (1).csv','customers':downloads/'customers_export (1).zip','orders':downloads/'orders_export_1 (1).csv','transactions':downloads/'transactions_export_1 (1).csv','open_orders':open_path}
digest=hashlib.sha256();sources={};manifest={}
for kind,path in paths.items():
    data=path.read_bytes();digest.update(data)
    manifest[kind]={'filename':path.name,'sha256':hashlib.sha256(data).hexdigest()}
    if path.suffix=='.zip':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names=[n for n in z.namelist() if n.endswith('.csv')]
            if len(names)!=1:raise ValueError('Expected exactly one customer CSV')
            data=z.read(names[0])
    reader=csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
    sources[kind]=list(reader)
    if any(None in row for row in sources[kind]):raise ValueError('Malformed '+kind+' CSV')
    manifest[kind]['rows']=len(sources[kind])
run='shopify_20260908_'+digest.hexdigest()[:12]
def number(value):
    try:return float(value)
    except (ValueError,TypeError):return None
def yes(value):return str(value).strip().lower() in ['true','yes','1']
def stripped(value):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',value or ''))).strip()
old={p['handle']:p for p in json.loads((root/'src/data/shopifyLaunchCatalog.generated.json').read_text())['products']}
groups={}
for row in sources['products']:groups.setdefault(row['Handle'],[]).append(row)
products=[];variants=[]
for handle,group in groups.items():
    header=next(r for r in group if r['Title']);prior=old.get(handle,{})
    product_id=prior.get('id') or prior.get('sku') or 'product_shopify_'+hashlib.sha256(handle.encode()).hexdigest()[:16]
    vs=[]
    for row in group:
        if not row['Option1 Value']:continue
        title=' / '.join(row.get('Option'+str(i)+' Value','') for i in range(1,4) if row.get('Option'+str(i)+' Value'))
        vid='variant_shopify_'+hashlib.sha256((handle+'|'+title).encode()).hexdigest()[:20]
        v={'id':vid,'product_id':product_id,'sku':row['Variant SKU'],'title':title,'price':number(row['Variant Price']),'compare_at_price':number(row['Variant Compare At Price']),'weight_grams':number(row['Variant Grams']),'grams':number(row['Variant Grams']),'shipping_weight_lb':number(row['Variant Grams'])/453.59237 if number(row['Variant Grams']) is not None else None,'barcode':row.get('Variant Barcodes') or None,'requires_shipping':yes(row['Variant Requires Shipping']),'taxable':yes(row['Variant Taxable']),'cogs':number(row['Cost per item']),'image':row['Variant Image'],'options':{row['Option'+str(i)+' Name']:row['Option'+str(i)+' Value'] for i in range(1,4) if row.get('Option'+str(i)+' Name')},'source':'shopify_snapshot_2026_09_08','available':prior.get('launch_decision')=='Launch','staging_import_run':run}
        vs.append(v);variants.append(v)
    prices=[v['price'] for v in vs if v['price'] is not None]
    images=list(dict.fromkeys(r['Image Src'] for r in group if r['Image Src']))
    product={**prior,'id':product_id,'sku':prior.get('sku') or (vs[0]['sku'] if vs and vs[0]['sku'] else product_id),'handle':handle,'name':header['Title'],'vendor':header['Vendor'],'category':prior.get('category') or header['Type'] or 'Consumable','product_type':header['Type'],'status':header['Status'],'shopify_published':yes(header['Published']),'published':prior.get('published',False) and header['Status']=='active','available':prior.get('launch_decision')=='Launch' and header['Status']=='active','launch_decision':prior.get('launch_decision','Review'),'launch_visibility':prior.get('launch_visibility','Review required'),'price':min(prices) if prices else None,'price_min':min(prices) if prices else None,'price_max':max(prices) if prices else None,'cogs':vs[0]['cogs'] if vs else None,'variants':vs,'images':images,'hero_image':images[0] if images else None,'description':stripped(header['Body (HTML)']),'summary':stripped(header['Body (HTML)'])[:220],'tags':[t.strip() for t in header['Tags'].split(',') if t.strip()],'barcode':vs[0]['barcode'] if vs else None,'source':'shopify_snapshot_2026_09_08','staging_import_run':run}
    products.append(product)
order_names={r['Name'] for r in sources['orders'] if r['Name']}
open_names={r['Name'] for r in sources['open_orders'] if r['Name']}
assert len(open_names)==29 and open_names<=order_names
assert len({p['id'] for p in products})==len(products)
assert len({v['id'] for v in variants})==len(variants)
summary={'products':len(products),'variants':len(variants),'customers':len(sources['customers']),'orders':len(order_names),'order_rows':len(sources['orders']),'open_orders':len(open_names),'open_order_rows':len(sources['open_orders']),'transactions':len(sources['transactions']),'inventory_rows':len(sources['inventory']),'locations':sorted({r['Location'] for r in sources['inventory']}),'products_pending_launch_review':sum(p['launch_decision']=='Review' for p in products)}
payload={'run_id':run,'sha256':digest.hexdigest(),'summary':summary,'manifest':manifest,'sources':sources,'products':products,'variants':variants}
(out/'snapshot-prepared.json').write_text(json.dumps(payload))
print(json.dumps({'run_id':run,**summary},indent=2))
