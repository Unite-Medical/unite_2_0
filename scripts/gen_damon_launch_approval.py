from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

OUT = Path('/Users/alex-s-nt-16/Projects/Unite/unite_2_0/docs/Damon_Launch_Approval_Packet_2026-08-24.docx')
NAVY = '102A43'; TEAL = '2F7A68'; AMBER = 'A86100'; RED = 'B42318'; LIGHT = 'F3F6F8'

def shade(cell, color):
    tcPr = cell._tc.get_or_add_tcPr(); fill = OxmlElement('w:shd'); fill.set(qn('w:fill'), color); tcPr.append(fill)
def set_cell(cell, text, bold=False, color=None):
    cell.text = ''; p = cell.paragraphs[0]; r = p.add_run(text); r.bold = bold
    if color: r.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

def table(doc, headers, rows, widths=None):
    t=doc.add_table(rows=1, cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.style='Table Grid'
    for i,h in enumerate(headers): shade(t.rows[0].cells[i], NAVY); set_cell(t.rows[0].cells[i],h,True,'FFFFFF')
    for row in rows:
        cells=t.add_row().cells
        for i,v in enumerate(row): set_cell(cells[i],str(v))
    return t

def h(doc,text,level=1):
    p=doc.add_heading(text,level); p.paragraph_format.space_before=Pt(14); return p

def bullet(doc,text): doc.add_paragraph(text,style='List Bullet')

d=Document(); sec=d.sections[0]; sec.top_margin=Inches(.65); sec.bottom_margin=Inches(.65); sec.left_margin=Inches(.7); sec.right_margin=Inches(.7)
styles=d.styles; styles['Normal'].font.name='Aptos'; styles['Normal'].font.size=Pt(10)
for name in ['Title','Heading 1','Heading 2']:
    styles[name].font.name='Aptos Display'; styles[name].font.color.rgb=RGBColor.from_string(NAVY)
p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run('UNITE MEDICAL');r.bold=True;r.font.color.rgb=RGBColor.from_string(TEAL);r.font.size=Pt(12)
p=d.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;r=p.add_run('Launch Approval Packet');r.bold=True;r.font.size=Pt(26);r.font.color.rgb=RGBColor.from_string(NAVY)
p=d.add_paragraph('Prepared for Damon Reed | Shopify history snapshot through August 24, 2026');p.alignment=WD_ALIGN_PARAGRAPH.CENTER
h(d,'What you are approving',1)
d.add_paragraph('This packet separates data now available in Unite from the operational decisions required before customers can place real orders. It does not claim live readiness where the data or workflow is incomplete.')
table(d,['Area','Current evidence','Approval needed'],[
['Shopify history','7,606 verified records imported into Unite History','Approve this as the historical commerce baseline'],
['Catalog','175 products, 451 variants, 22 collections, 3 menus, 38 redirects','Approve the catalog promotion review process, not automatic publishing'],
['Inventory','1,380 Shopify location snapshots across three locations','Approve physical opening-count and reconciliation process before WMS stock goes live'],
['Finance','1,982 orders, 1,961 transactions, 219 payouts','Approve accounting reconciliation plan before historical paid status is relied on'],
['Commerce launch','Core production services are configured, QBO and Cin7 are not','Choose staged launch gate and accountable owners'],])
h(d,'Shopify data now in Unite',1)
table(d,['Dataset','Verified count','Use now','Do not use yet'],[
['Products','175 products, 451 variants','Catalog review, pricing review, SEO and redirect parity','Automatic customer ordering'],
['Customers','556 customers, 806 addresses','Account history, concentration analysis, CRM cleanup','Automatic account creation or approval'],
['Orders','1,982 orders, 3,252 order lines','Sales BI, customer history, SKU demand','Editable live Unite orders'],
['Transactions','1,961 events','Payment evidence and reconciliation queue','Proof of bank receipt for manual payments'],
['Inventory','1,380 SKU-location snapshots','Physical count worksheet and variance analysis','WMS on-hand, allocation, replenishment'],
['Payouts','219 paid payouts','Shopify payment reconciliation','Complete accounting without QBO/bank tie-out'],])
h(d,'Sales history highlights',1)
table(d,['Metric','Observed result','Interpretation'],[
['Historical paid-order gross sales','$4.66m across 1,969 paid-like orders','Meaningful commerce history'],
['Average paid order','$2,365.52','B2B order economics, not consumer-cart behavior'],
['Net Shopify transaction value','$4.62m after $52,988.90 of recorded refunds','Needs payout and bank reconciliation'],
['Largest account','DDP Medical: $1.21m across 91 orders','Material concentration risk'],
['Volatility','Recent months range from about $24k to $224k','Large-account timing and order mix drive results'],
['Margin','NOT SURE','Historical COGS, freight, vendor credits, and manual-payment evidence are incomplete'],])
h(d,'Launch blockers requiring a Damon decision',1)
table(d,['Decision','Default proposed','Approve / change'],[
['D-01 Inventory authority','Unite WMS ledger becomes authority only after physical count and approved opening movements',''],
['D-02 Catalog promotion','Shopify History remains read-only until SKU, pack, price, status, barcode, and quote-only review passes',''],
['D-03 Default pricing','No approved account can order an active SKU without approved retail/default price',''],
['D-04 Payment model','Invoice plus ACH/bank is default. Credit terms need credit approval. Card is optional only after fee rules are validated',''],
['D-05 Accounting','No historical Shopify manual payment is treated as bank-collected cash until reconciled',''],
['D-06 Fulfillment','No label marks stock shipped. WMS ship movement requires carrier scan, signed BOL, or documented custody handoff',''],
['D-07 Launch shape','Start with controlled internal and approved-account pilot, not open self-service launch',''],])
h(d,'Recommended staged launch',1)
table(d,['Stage','Exit evidence','Owner'],[
['1. Catalog approval','Every active sellable SKU has approved price, pack, status, and fulfillment rule','Damon + sales/ops'],
['2. Opening inventory','Physical count, variance review, signed opening count, ledger posting','Ops + Damon'],
['3. Finance connection','QBO connected, ACH/invoice workflow tested, payout reconciliation sample completed','Finance + Damon'],
['4. Fulfillment proof','One real parcel order and one exception drill complete with custody evidence','Ops'],
['5. Pilot launch','Approved accounts only. Monitor payment, stock, shipping, and support daily','Damon'],
['6. Broader launch','Pilot exceptions closed and launch metrics reviewed','Damon'],])
h(d,'Current live integration status',1)
table(d,['Configured and reporting live','Not configured or not a launch proof'],[
['Shopify Admin API, Stripe, ShipStation, Resend, HubSpot, Anthropic, Flexport, Neon/Postgres, openFDA, HTS','QuickBooks Online, Cin7 Core, GS1 US, ImportGenius, Gmail, Google Calendar, Calendly, forecast service'],])
d.add_paragraph('Configured means credentials are present and the production health endpoint reports the service configured. It does not by itself prove a full production business workflow has been exercised.')
h(d,'Approval record',1)
d.add_paragraph('Use this section in the meeting. Mark Approve, Change, or Hold for each decision, then record the final owner and date.')
table(d,['Decision','Approve','Change','Hold','Owner / notes'],[[f'D-{i:02}', '','', '', ''] for i in range(1,8)])
d.add_paragraph('Evidence verified on August 24, 2026: Shopify snapshot import count 7,606, Shopify History dashboard import read-back, production health endpoint, phase and PRD checks, 112 orchestration tests passed. No em dash or en dash characters are used in this document.')
d.save(OUT)
print(OUT)
