#!/usr/bin/env python3
import argparse, csv, json
from pathlib import Path

FIELDS = ['SKU','Title','Location','Bin name','Incoming (not editable)','Unavailable (not editable)','Committed (not editable)','Available (not editable)','On hand (current)']

def main():
    p=argparse.ArgumentParser();p.add_argument('inventory_csv');p.add_argument('output');a=p.parse_args()
    with Path(a.inventory_csv).open(newline='',encoding='utf-8-sig') as f:
        rows=[{k:r.get(k,'') for k in FIELDS} for r in csv.DictReader(f)]
    if len(rows)!=1380: raise SystemExit(f'expected 1380 rows, got {len(rows)}')
    locations=sorted({r['Location'] for r in rows})
    Path(a.output).write_text(json.dumps({'rows':rows,'locations':locations},indent=2)+'\n')
    print(json.dumps({'rows':len(rows),'locations':locations}))
if __name__=='__main__':main()
