import test from 'node:test';
import assert from 'node:assert/strict';
import {financeWorkspace} from '../api/_lib/financeWorkspace.js';
import {planInvoicePayment} from '../api/_lib/arPayment.js';
import {invoiceCurrency,invoiceBalanceTotals,formatInvoiceMoney} from '../src/lib/invoiceCurrency.js';

const invoices=[
 {id:'usd',currency:'USD',amount:100,balance:75,paid_amount:25,status:'open'},
 {id:'eur',currency:'EUR',amount:250,balance:250,paid_amount:0,status:'open'},
 {id:'legacy',amount:30,balance:30,paid_amount:0,status:'open'},
];
test('Finance read projection preserves currency and amounts without changing records',()=>{
 const original=structuredClone(invoices),projected=financeWorkspace(invoices,[]);
 assert.equal(projected[0].currency,'USD');assert.equal(projected[1].currency,'EUR');
 assert.equal(projected[1].amount,250);assert.equal(projected[1].balance,250);
 assert.equal(Object.hasOwn(projected[2],'currency'),false);
 assert.deepEqual(invoices,original);
});
test('Open balances stay separate per currency, including the legacy USD convention',()=>{
 const projected=financeWorkspace(invoices,[]);
 assert.deepEqual(invoiceBalanceTotals(projected),[['EUR',250],['USD',105]]);
 assert.deepEqual(invoiceBalanceTotals([]),[]);
 assert.equal(invoiceCurrency(projected[2]),'USD');
});
test('Amounts are labelled in their currency, including safe fallback for malformed codes',()=>{
 assert.match(formatInvoiceMoney(250,'EUR'),/^EUR\s250\.00$/u);
 assert.match(formatInvoiceMoney(105,'USD'),/^USD\s105\.00$/u);
 assert.equal(formatInvoiceMoney(50,'unknown-currency'),'unknown-currency 50.00');
});
test('Non-USD payment refusal remains intact and USD planning does not mutate source data',()=>{
 const original=structuredClone(invoices),input={provider:'off_platform',payment_reference:'synthetic-reference',method:'ach',amount:25};
 assert.equal(planInvoicePayment({invoice:invoices[1],input,actorId:'synthetic-finance'}).reason,'invoice_currency_requires_reconciliation');
 assert.equal(planInvoicePayment({invoice:invoices[0],input,actorId:'synthetic-finance'}).ok,true);
 assert.deepEqual(invoices,original);
});
