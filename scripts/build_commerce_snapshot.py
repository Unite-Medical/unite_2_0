import json,csv,hashlib,collections,re
from pathlib import Path
root=Path(__file__).resolve().parents[2]; p=root/'output/Customer-migration-audit-2026-09-23'; dst=root/'unite-clean-launch/api/_data/commerce-snapshot.json'
def csvrows(n,source='data'):return list(csv.DictReader((p/source/n).open()))
def jl(n):return [json.loads(s) for s in (p/'sources'/n).read_text().splitlines() if s.strip()]
def num(v):
 try:return float(v)
 except:return 0

def arr(v):
 try:return json.loads(v)
 except:return []
def ident(*v):return hashlib.sha256('|'.join(map(str,v)).encode()).hexdigest()[:20]
rows=[]
def add(t,x):
 x={'revision':0,**x}; rows.append({'table':t,'id':x['id'],'data':x});return x
customers=csvrows('customers.csv'); helium={x['shopify_id']:x for x in csvrows('helium-all-fields-2026-09-23.csv','sources') if x['shopify_id']}; rawcustomers={x['legacyResourceId']:x for x in jl('customers-2026-09-21.jsonl')}; raworders={x['name']:x for x in jl('recent-orders-2026-09-21.jsonl')}; reviews=json.loads((p/'data/live-order-reviews.json').read_text()); orders=csvrows('orders.csv'); lines=csvrows('order-lines.csv'); addresses=csvrows('addresses.csv'); products=jl('products-2026-09-21.jsonl'); sourceorders={x['Name']:x for x in reversed(csvrows('orders-2026-09-23.csv','sources')) if x['Id']}; prices={}; bysku=collections.defaultdict(list)
for pdt in products:
 for v in pdt['variants']['nodes']:
  inv=v.get('inventoryItem') or {}; stock=[]
  for l in inv.get('inventoryLevels',{}).get('nodes',[]): stock.append({'location':l['location']['name'],'quantities':l['quantities']})
  discontinued='dairy' in pdt['title'].lower() and 'mega' in pdt['title'].lower()
  x=add('commerce_products',{'id':str(v['legacyResourceId']),'variant_id':v['id'],'product_id':pdt['id'],'sku':v['sku'],'name':pdt['title'],'variant':v['title'],'retail':num(v['price']),'compare_at':num(v.get('compareAtPrice')),'image':(v.get('image') or {}).get('url') or ((pdt.get('featuredMedia') or {}).get('preview',{}).get('image') or {}).get('url',''),'barcode':v.get('barcode',''),'status':'discontinued' if discontinued else pdt['status'].lower(),'inventory':stock,'inventory_source_date':'2026-09-21','cost':None,'review_note':'Damon: dairy-free MegaPre discontinued, September 23 recording.' if discontinued else ''})
  bysku[v['sku']].append(x)
for state,file in [('active','sparklayer-prices-mapped.csv'),('held','sparklayer-prices-held.csv'),('retired','sparklayer-prices-retired.csv')]:
 for i,r in enumerate(csvrows(file)):
  lid=r['price_list']; pr={**r,'id':ident(lid,r['sku'],r['minimum_quantity'],state,i),'sku':r.get('canonical_sku') or r['sku'],'source_sku':r['sku'],'minimum_quantity':num(r['minimum_quantity']),'unit_price':num(r['unit_price']),'status':state,'reason':r.get('disposition',''),'product_name':r.get('product',''),'source_kind':'SparkLayer'}
  if pr['unit_price']<=0:pr.update(status='held',reason='Zero price: Damon says products should not be free; verify bundle exception.')
  if 'example' in lid.lower() or lid=='b2b2':pr.update(status='held',reason='No confirmed customer use; review before assignment.')
  prices.setdefault(lid,[]).append(pr)
assignments=collections.defaultdict(list)
for a in csvrows('pricing-assignment-candidates.csv'):
 if a['price_list'] in prices and a['price_list'] not in assignments[a['customer_id']]:assignments[a['customer_id']].append(a['price_list'])
for c in customers:
 if 'ilkhom' in (c['first_name']+' '+c['last_name']).lower() or 'jabarov' in c['last_name'].lower(): assignments[c['customer_id']]=['ilkhom-dzhabarov']
for cid in assignments: assignments[cid].sort(key=lambda lid: lid in ('b2b1','b2b2'))
lineby=collections.defaultdict(list);orderby=collections.defaultdict(list);addrby=collections.defaultdict(list)
for a in addresses:
 phones=arr(a['phones']);addrby[a['customer_id']].append({'id':a['address_id'],'recipient':a['recipient'],'company':a['company'],'address1':a['address1'],'address2':a['address2'],'city':a['city'],'province':a['provinceCode'],'zip':a['zip'],'country':a['countryCode'],'phone':phones[0] if phones else '', 'source_kinds':arr(a['kinds']),'source_orders':arr(a['orders']),'is_default':False})
for i,l in enumerate(lines):
 sku=l.get('canonical_sku') or l['sku']; matches=bysku[sku]; prod=matches[0] if len(matches)==1 else {}; qty=num(l['current_quantity'] if l['current_quantity']!='' else l['export_quantity']);removed=str(l['removed']).lower()=='true';qty=0 if removed else qty
 lineby[l['order']].append({**l,'id':ident(l['order'],l['source_record'],i),'sku':sku,'source_sku':l['sku'],'variant_id':l.get('canonical_variant_id') or prod.get('variant_id',''),'product_id':prod.get('id',''),'name':l['description'],'quantity':qty,'original_quantity':num(l['export_quantity']),'removed':removed,'unit_price':num(l['net_unit_before_order_adjustments']),'retail':num(l['gross_unit_price']),'image':prod.get('image',''),'mapping_status':'matched' if prod or l.get('canonical_variant_id') else 'needs_review','unfulfilled_quantity':None})
remaining=collections.defaultdict(list)
for r in csvrows('remaining-fulfillment-hold.csv'):remaining[r['order']].append(r)
for o in orders:
 raw=raworders.get(o['order'],{}); review=reviews.get(o['order'],{}); archive=(o['created_at'][:10]<'2026-05-26' and o['fulfillment_status']!='fulfilled') or o['order']=='#1057'; reviewnote=''
 if o['order']=='#2965':reviewnote='Confirm SKU 55001 vs 55501 (recording correction is contradictory). Ashley to verify $370.72 balance in QuickBooks.'
 if o['order']=='#2997':reviewnote='Jacobe to identify missing 3M SKUs.'
 if o['order']=='#2568':archive=False;reviewnote='Damon to confirm whether five size-two cases remain owed.'
 if o['order']=='#3021':reviewnote='Damon confirms 12 small knee braces still owed.'
 if o['order']=='#2879':reviewnote='Damon confirms order remains open.'
 ol=lineby[o['order']]
 for l in ol:
  rr=[r for r in remaining[o['order']] if r['sku'] and r['sku']==l['source_sku']]
  if len(rr)==1:l['unfulfilled_quantity']=num(rr[0]['quantity'])
 sourceaddresses=[a for a in addrby[o['customer_id']] if o['order'] in a['source_orders']]
 def fromraw(a):return {'recipient':' '.join(filter(None,[a.get('firstName'),a.get('lastName')])),'company':a.get('company',''),'address1':a.get('address1',''),'address2':a.get('address2',''),'city':a.get('city',''),'province':a.get('provinceCode',''),'zip':a.get('zip',''),'country':a.get('countryCode',''),'phone':a.get('phone','')}
 ship=fromraw(raw['shippingAddress']) if raw.get('shippingAddress') else next((a for a in sourceaddresses if any('ship-to' in k.lower() for k in a['source_kinds'])),{})
 bill=fromraw(raw['billingAddress']) if raw.get('billingAddress') else next((a for a in sourceaddresses if any('bill-to' in k.lower() for k in a['source_kinds'])),{})
 fresh=sourceorders.get(o['order'],{})
 def fromcsv(prefix):return {k:fresh.get(prefix+' '+source,'') for k,source in [('recipient','Name'),('company','Company'),('address1','Address1'),('address2','Address2'),('city','City'),('province','Province'),('zip','Zip'),('country','Country'),('phone','Phone')]}
 if fresh.get('Shipping Address1'):ship=fromcsv('Shipping')
 if fresh.get('Billing Address1'):bill=fromcsv('Billing')
 x=add('commerce_orders',{'id':o['shopify_order_id'] or o['order'].replace('#','legacy-'),'number':o['order'],'customer_id':o['customer_id'],'email':o['email'],'created_at':o['created_at'],'financial_status':o['financial_status'],'fulfillment_status':o['fulfillment_status'],'workflow_state':'archived' if archive else 'complete' if o['fulfillment_status']=='fulfilled' else 'needs_review','total':num(o['reviewed_current_total'] or review.get('current_total') or o['export_total']),'shipping':num(o['shipping']),'tax':num(o['taxes']),'discount':num(o['order_discount']),'currency':o['currency'],'notes':o['notes'],'tags':[s.strip() for s in o['tags'].split(',') if s.strip()],'payment_method':o['payment_method'],'terms':o['payment_terms'],'source':o,'lines':ol,'shipping_address':ship,'billing_address':bill,'fulfillments':raw.get('fulfillments',[]),'review_note':reviewnote,'review':review,'refund_liability':0 if o.get('refund_resolution') or review.get('migration_refund_liability')=='0.00' else None,'historical':True,'archive_reason':'Damon: retain history; older than 120 days, or explicitly archived #1057.' if archive else '', 'remaining_review':remaining[o['order']],'events':[]})
 orderby[o['customer_id']].append(x)
# A paid historical unit price is customer-specific; exclude removed/free/cancelled/refund replacements and ambiguous product identities.
contracts=collections.defaultdict(list)
for c in customers:
 cid=c['customer_id']; seen=set()
 for o in sorted(orderby[cid],key=lambda x:x['created_at'],reverse=True):
  if o['source'].get('cancelled_at') or o['total']<=0 or o['financial_status'] not in ('paid','partially_refunded'):continue
  for l in o['lines']:
   key=l['variant_id'] or l['sku']
   if not key or key in seen or l['removed'] or l['quantity']<=0 or l['unit_price']<=0:continue
   seen.add(key)
   if not l['variant_id'] or l['mapping_status']!='matched':continue
   candidates=[r for lid in assignments[cid] for r in prices.get(lid,[]) if r['status']=='active' and r.get('variant_id')==l['variant_id'] and r['minimum_quantity']<=l['quantity']]
   spark=next((r for r in sorted(candidates,key=lambda r:r['minimum_quantity'],reverse=True) if abs(r['unit_price']-l['unit_price'])<.011),None)
   if spark:continue
   # A plain retail purchase does not create a special agreement.
   cat=next((r for r in bysku[l['sku']] if r['variant_id']==l['variant_id']),{})
   if abs(l['unit_price']-l['retail'])<.011 and abs(l['unit_price']-cat.get('retail',l['retail']))<.011:continue
   contracts[cid].append({'id':ident(cid,key),'sku':l['sku'],'variant_id':l['variant_id'],'product_name':l['name'],'minimum_quantity':1,'unit_price':l['unit_price'],'currency':o['currency'],'status':'active','source_kind':'Customer agreement','source_order':o['number'],'source_order_id':o['id'],'source_date':o['created_at'],'reason':'Latest retained paid custom unit price; Damon September 23 recording. No volume stacking.'})
for c in customers:
 cid=c['customer_id'];h=helium.get(cid,{}); raw=rawcustomers.get(cid,{}); ad=addrby[cid]; default={k:h.get('default_address.'+s,'') for k,s in [('recipient','name'),('company','company'),('address1','address1'),('address2','address2'),('city','city'),('province','province_code'),('zip','zip'),('country','country_code'),('phone','phone')]}
 if default['address1']:
  match=next((a for a in ad if all(str(a.get(k,'')).strip().lower()==str(default.get(k,'')).strip().lower() for k in ['address1','address2','zip','recipient','company'])),None)
  if match:match['is_default']=True
  else:ad.insert(0,{**default,'id':ident(cid,'default'),'is_default':True,'source_kinds':['Shopify default address via Helium Sep23'],'source_orders':[]})
 name=(c['first_name'].strip() if c['first_name'].strip().casefold()==c['last_name'].strip().casefold() else ' '.join(filter(None,[c['first_name'].strip(),c['last_name'].strip()]))) or c['email'] or 'Customer '+cid
 if contracts[cid]:lid='customer-'+cid;prices[lid]=contracts[cid];assignments[cid].insert(0,lid)
 os=orderby[cid];active=any(o['created_at'][:4]=='2026' for o in os)
 add('commerce_customers',{'id':cid,'org_id':'org_shopify_'+cid,'name':name,'first_name':c['first_name'],'last_name':c['last_name'],'email':c['email'],'phone':c['phone'],'company':c['company_current'] or default['company'],'notes':c['note'],'tags':arr(c['tags']),'email_subscription':c['email_marketing_state_current'].lower(),'sms_subscription':c['sms_marketing_sep08'],'tax_exempt':c['tax_exempt_current'].lower()=='yes','tax_exemptions':h.get('tax_exemptions',''),'certificate_status':'missing','certificate_action_required':active and c['tax_exempt_current'].lower()=='yes','language':h.get('locale') or 'en','created_at':h.get('shopify_created_at') or raw.get('createdAt'),'amount_spent':62332.25 if cid=='7581978296486' else num(h.get('total_spent')),'amount_spent_evidence':'Live Shopify customer page reviewed Sep23' if cid=='7581978296486' else 'Helium export Sep23','source_order_count':num(h.get('orders_count')),'last_order_date':max((o['created_at'] for o in os),default=''),'imported_order_count':len(os),'addresses':ad,'price_lists':assignments[cid],'status':'active','approval_status':'review_required','terms':'needs_confirmation','credit_limit':None,'store_credit':None,'overdue_policy':'hold','payment_review':'QuickBooks / Ashley verification required; SparkLayer credit limits not authoritative.','account_rep':'Jacobe' if 'b2b' in arr(c['tags']) else '', 'events':[], 'source':c})
for lid,pr in prices.items():
 cid=lid.removeprefix('customer-') if lid.startswith('customer-') else None
 c=next((c for c in customers if c['customer_id']==cid),None)
 add('commerce_price_lists',{'id':lid,'name':(' '.join([c['first_name'],c['last_name']])+' · agreed prices') if c else lid.replace('-',' ').title(),'kind':'Customer agreement' if c else 'SparkLayer','customer_id':cid,'rows':pr,'currency':'USD','status':'held' if lid=='b2b2' or 'example' in lid else 'active','notes':'Customer-specific unit price; quantity discounts do not stack.' if c else 'Imported quantity breaks; original case and pack units preserved.'})
# Private evidence stays server-side, available only to authenticated admin detail requests.
tx=csvrows('transactions-2026-09-23.csv','sources'); txby=collections.defaultdict(list)
print('transaction keys',list(tx[0]) if tx else [])
for t in tx:txby[t.get('Name','') or t.get('Order','')].append(t)
for row in rows:
 if row['table']=='commerce_orders':row['data']['transactions']=txby[row['data']['number']]
summary=collections.Counter(r['table'] for r in rows);payload={'version':'2026-09-23-damon-v1','source_dates':{'customers':'2026-09-23','orders':'2026-09-23','catalog':'2026-09-21','saved_addresses':'2026-09-21'},'counts':dict(summary),'rows':rows};dst.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')));print(dict(summary),'size',dst.stat().st_size,'contracts',sum(map(len,contracts.values())))
