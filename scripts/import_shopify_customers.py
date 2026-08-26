#!/usr/bin/env python3
import argparse, csv, hashlib, json, urllib.request
from pathlib import Path


def load(csv_path, api_path):
    csv_bytes = Path(csv_path).read_bytes()
    api_bytes = Path(api_path).read_bytes()
    customers = list(csv.DictReader(csv_bytes.decode('utf-8-sig').splitlines()))
    api_customers = json.loads(api_bytes)
    by_id = {str(row.get('legacyResourceId') or ''): row for row in api_customers}
    combined = []
    for row in customers:
        customer_id = str(row.get('Customer ID') or '')
        api = by_id.get(customer_id, {})
        combined.append({'source': row, 'addresses': api.get('addresses') or ([api.get('defaultAddress')] if api.get('defaultAddress') else [])})
    digest = hashlib.sha256(csv_bytes + b'\0' + api_bytes).hexdigest()
    return combined, digest


def post(endpoint, token, payload):
    req = urllib.request.Request(endpoint.rstrip('/') + '/api/internal/customer-migration', data=json.dumps(payload).encode(), method='POST', headers={'Content-Type':'application/json','x-customer-migration-token':token})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.loads(response.read())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('customers_csv'); parser.add_argument('api_customers_json')
    parser.add_argument('--endpoint'); parser.add_argument('--token-file'); parser.add_argument('--batch-size', type=int, default=25)
    args = parser.parse_args()
    customers, digest = load(args.customers_csv, args.api_customers_json)
    run_id = f'shopify_customers_{digest[:20]}'
    summary = {'run_id':run_id,'source_sha256':digest,'customers':len(customers),'batches':(len(customers)+args.batch_size-1)//args.batch_size,'addresses':sum(len(row['addresses']) for row in customers)}
    if not args.endpoint:
        print(json.dumps({'dry_run':True,**summary}, indent=2)); return
    if not args.token_file: raise SystemExit('--token-file is required when --endpoint is used')
    token = Path(args.token_file).read_text().strip()
    totals = {'customers':0,'profiles':0,'addresses':0,'activation_eligible':0,'activation_holds':0,'pricing_holds':0}
    for index in range(0,len(customers),args.batch_size):
        result = post(args.endpoint, token, {'run_id':run_id,'source_sha256':digest,'customers':customers[index:index+args.batch_size]})
        for key in totals: totals[key] += int(result['summary'].get(key,0))
    print(json.dumps({'ok':True,**summary,'accepted':totals}, indent=2))

if __name__ == '__main__': main()
