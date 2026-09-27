"""Read-only reconciliation; never mutates a source or sends invitations."""
import json, re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import Counter,defaultdict
root=Path(__file__).resolve().parents[1]
out=root/'artifacts/september-handoff'
old=json.loads((root/'migration-data/snapshot-prepared.json').read_text())
current=out/'shopify-verified-refresh'
read=lambda n:[json.loads(l) for l in (current/f'{n}.jsonl').read_text().splitlines()]
products,customers,orders=read('products'),read('customers'),read('orders')
now=datetime(2026,9,21,12,33,tzinfo=timezone.utc);start=now-timedelta(days=90)
parse=lambda x:datetime.fromisoformat(x.replace('Z','+00:00'))
merged={}
for o in old['sources']['orders']:
 if not o.get('Created at'):continue
 merged[o['Name']]={'name':o['Name'],'email':o['Email'].lower(),'created_at':o['Created at'],'cancelled':bool(o['Cancelled at']),'total':o['Total'],'source':'September 8 CSV'}
for o in orders:merged[o['name']]={'name':o['name'],'email':((o.get('customer',{}).get('email') if o.get('customer') else o.get('email')) or '').lower(),'created_at':o['createdAt'],'cancelled':bool(o['cancelledAt']),'total':o['totalPriceSet']['shopMoney']['amount'],'source':'September 21 GraphQL'}
frequency=Counter(o['email'] for o in merged.values() if o['email'] and not o['cancelled'] and start<=parse(o['created_at'])<=now)
by_email=defaultdict(list)
for c in customers:by_email[(c.get('email')or'').lower()].append(c)
valid=lambda e:bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$',e)) and not re.search(r'^(no-?reply|noemail|none|unknown|test|customer)[+._-]*@|@(example|invalid)\.|@no-reply\.com$|@ul\.shipping\.temuemail\.com$',e,re.I)
exceptions=[{'id':c['legacyResourceId'],'name':c['displayName'],'email':c.get('email'),'reason':'missing/placeholder email' if not valid(c.get('email')or'') else 'duplicate email'} for c in customers if not valid(c.get('email')or'') or len(by_email[(c.get('email')or'').lower()])>1]
ranked=[]
for email,count in frequency.most_common():
 matches=by_email[email]
 if len(matches)==1 and valid(email):
  c=matches[0];ranked.append({'id':c['legacyResourceId'],'name':c['displayName'],'email':email,'orders_90d':count,'pricing':'SparkLayer source reconciliation pending','terms':'source verification pending'})
 if len(ranked)==10:break
reviews=[]
for prior in old['products']:
 if prior.get('launch_decision')!='Review':continue
 p=next((p for p in products if p['handle']==prior['handle']),None)
 reviews.append({'name':p['title'] if p else prior['name'],'shopify_id':p['legacyResourceId'] if p else None,'skus':[v['sku'] for v in p['variants']['nodes'] if v['sku']] if p else [],'handle':prior['handle']})
prior_ids={str(c['Customer ID']).lstrip("'") for c in old['sources']['customers']}
new=[{'id':c['legacyResourceId'],'name':c['displayName']} for c in customers if str(c['legacyResourceId']) not in prior_ids]
visible_open=[o for o in orders if not o.get('closedAt') and not o.get('cancelledAt')]
old_open={o['Name'] for o in old['sources']['open_orders']};visible_names={o['name'] for o in orders};unverified_old=sorted(old_open-visible_names)
synergy=json.loads((out/'synergy-source.json').read_text())['data']['customers']['nodes'][0]
prior_synergy=next(c for c in old['sources']['customers'] if str(c['Customer ID']).lstrip("'")==synergy['id'].split('/')[-1])
report={'observed_at':now.isoformat(),'current_products':len(products),'current_customers':len(customers),'new_customers':new,'visible_recent_orders':len(orders),'visible_recent_open_orders':len(visible_open),'older_open_orders_not_visible_to_api':unverified_old,'email_exceptions':exceptions,'invitation_candidates':ranked,'products_pending_decision':reviews,'synergy':{'customer_id':synergy['id'].split('/')[-1],'current_spend':synergy['amountSpent']['amount'],'previous_spend':prior_synergy['Total Spent'],'spend_delta':round(float(synergy['amountSpent']['amount'])-float(prior_synergy['Total Spent']),2),'sales_agent_groups':next((m['value'] for m in synergy['metafields']['nodes'] if m['key']=='sales_agent_groups'),None)},'limitations':['API has read_orders but not read_all_orders; historical changes outside recent scope are unverified.','90-day ranking merges the September 8 CSV and September 21 recent API orders by order name. Jacobe must review before invitations.','This is source evidence, not proof of staging import or sign-in pricing.']}
(out/'reconciliation.json').write_text(json.dumps(report,indent=2))
lines=['# September 21 source reconciliation','',f'Observed {now.isoformat()}. Read-only; no invitations or migration writes performed.','',f'Products: {len(products)}. Customers: {len(customers)} (+{len(new)}). Recent visible orders: {len(orders)}; open: {len(visible_open)}. Older previously open orders not visible through this API: {len(unverified_old)}.','',f'Current email exception records: {len(exceptions)}. See private reconciliation.json for record-level IDs, emails and reasons.','',f"Synergy customer {report['synergy']['customer_id']}: source assignment {report['synergy']['sales_agent_groups']}; prior spend ${report['synergy']['previous_spend']}; current ${report['synergy']['current_spend']}; delta ${report['synergy']['spend_delta']:.2f}.",'','## Ten invitation candidates — Jacobe review required','','| Customer | Shopify ID | Orders in previous 90 days | Email |','|---|---|---:|---|']
for r in ranked:lines.append(f"| {r['name']} | {r['id']} | {r['orders_90d']} | {r['email']} |")
lines+=['','Every candidate still needs pricing/terms verification and Jacobe review. No invitation is authorized or sent by this report.','','## Exact twelve products pending prior launch decisions','','| Product | Shopify ID | SKU(s) |','|---|---|---|']
for p in reviews:lines.append(f"| {p['name']} | {p['shopify_id']} | {', '.join(p['skus']) or 'No SKU supplied in current source'} |")
lines+=['','## Limitations','',*report['limitations']]
(out/'source-reconciliation.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({k:v for k,v in report.items() if k in ['current_products','current_customers','visible_recent_orders','visible_recent_open_orders','older_open_orders_not_visible_to_api','synergy']},indent=2))
