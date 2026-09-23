#!/usr/bin/env python3
import argparse, html, json, re
from pathlib import Path

CATEGORY = {
    'Surgical Supplies': 'Surgical', 'Medical Gloves': 'PPE', 'Medical Face Masks': 'PPE',
    'Diagnostic Tests': 'Diagnostics', 'Orthopedic Devices': 'Orthotics', 'Supports & Braces': 'Orthotics',
    'Back Brace': 'Orthotics', 'Cervical Collar': 'Orthotics', 'Supplements': 'Supplements',
}

def text(value):
    value = re.sub(r'<[^>]+>', ' ', value or '')
    return re.sub(r'\s+', ' ', html.unescape(value)).strip()

def number(value):
    try: return float(value)
    except (TypeError, ValueError): return 0.0

def main():
    p=argparse.ArgumentParser(); p.add_argument('snapshot_jsonl'); p.add_argument('decisions_json'); p.add_argument('output'); a=p.parse_args()
    decisions=json.loads(Path(a.decisions_json).read_text())['products']; rules={r['handle']:r for r in decisions}
    products=[]
    for line in Path(a.snapshot_jsonl).read_text().splitlines():
        src=json.loads(line); rule=rules.get(src['handle'])
        if not rule: raise SystemExit(f"missing decision: {src['handle']}")
        variants=[]
        for v in src['variants']:
            weight_lb=8 if v.get('sku')=='NGPF7000' else number(v.get('grams'))/453.59237
            variants.append({'title':v.get('title') or 'Default','sku':v.get('sku') or '', 'price':number(v.get('price')), 'compare_at_price':number(v.get('compare_at_price')) or None,'barcode':v.get('barcode') or None,'grams':number(v.get('grams')),'shipping_weight_lb':round(weight_lb,4),'requires_shipping':bool(v.get('requires_shipping')),'taxable':bool(v.get('taxable')),'image':v.get('image') or None,'available':rule['decision']=='Launch'})
        prices=[v['price'] for v in variants if v['price']>0]; images=[m.get('src') for m in src.get('media',[]) if m.get('src')]
        desc=text(src.get('description_html')); visibility=rule.get('visibility') or ''
        products.append({'id':variants[0]['sku'] if variants and variants[0]['sku'] else src['handle'],'sku':variants[0]['sku'] if variants else src['handle'],'handle':src['handle'],'name':src['title'],'vendor':src.get('vendor'),'category':CATEGORY.get(src.get('product_type'),'Consumable'),'product_type':src.get('product_type'),'tier':'Consumable','tags':src.get('tags') or [],'description':desc,'summary':desc[:220],'images':images,'hero_image':images[0] if images else None,'price':min(prices) if prices else None,'price_min':min(prices) if prices else None,'price_max':max(prices) if prices else None,'variants':variants,'launch_decision':rule['decision'],'launch_visibility':visibility,'status':'archived' if rule['decision']=='Archive' else src.get('status'),'available':rule['decision']=='Launch','published':rule['decision']=='Launch' and visibility=='Public Storefront','quote_only':'Quote' in visibility or 'Restricted' in visibility})
    if len(products)!=175: raise SystemExit(f'expected 175 products, got {len(products)}')
    Path(a.output).write_text(json.dumps({'products':products},indent=2)+'\n')
    print(json.dumps({'products':len(products),'launch':sum(p['launch_decision']=='Launch' for p in products),'published':sum(p['published'] for p in products)}))
if __name__=='__main__': main()
