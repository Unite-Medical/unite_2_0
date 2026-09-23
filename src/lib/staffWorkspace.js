// Shared presentation policy. The API independently enforces the same role boundary.
export const STAFF_ROLES = ['admin','sales','sales_manager','customer_service','warehouse_operator','warehouse_manager','finance','sourcing','sourcing_manager'];
export const teamForRole = role => role === 'admin' ? 'all' : role === 'finance' ? 'finance' : role?.startsWith('warehouse_') ? 'warehouse' : ['sourcing','sourcing_manager'].includes(role) ? 'sourcing' : 'sales';
export const STAFF_TEAMS = {
 all: {label:'Everyone',title:'A clear view of the day.',description:'Decisions, handoffs, and the work that needs your attention.',person:'Damon',routine:['Review approval requests','Unblock the team','Check overdue customer work']},
 sales: {label:'Sales & service',title:'Keep every customer moving.',description:'Inquiries, quotes, sourcing, and follow-ups in one place.',person:'Jacobe',routine:['Respond to new inquiries','Follow up on quotes and sourcing','Update customers on backorders']},
 warehouse: {label:'Warehouse',title:'Know what’s coming. Know what’s going.',description:'Deliveries, open shipments, pickups, and stock checks.',person:'Darren',routine:['Check incoming purchase orders','Review today’s outgoing work','Record counts and discrepancies']},
 finance: {label:'Finance',title:'Keep the numbers moving.',description:'Payments, billing checks, and refund reviews that need attention.',person:'Ashley',routine:['Match payments to invoices','Review received quantities and bills','Review refunds before Damon’s approval']},
 sourcing: {label:'Sourcing',title:'Find the next way forward.',description:'Open requests, supplier responses, and purchasing follow-ups.',person:'Sourcing team',routine:['Review incoming requests','Follow up on supplier offers','Confirm purchase-order acknowledgments']},
};
export function staffHome(role) { return STAFF_ROLES.includes(role) ? '/work' : role === 'distributor' ? '/distributor' : '/dashboard'; }
export function staffShortcuts(role, {inquiries=false}={}) {
 const base=[{label:'Today',path:'/work',id:'work',group:'Your workspace'},...((role==='admin'||role==='finance'||role?.startsWith('warehouse_')||inquiries)?[{label:'WellLink',path:'/staff/welllink',id:'welllink',group:'Partner programs'}]:[]),...(['admin','finance','warehouse_operator','warehouse_manager'].includes(role)||inquiries?[{label:'Split shipments',path:'/staff/shipments',id:'shipments',group:'Daily work'}]:[])];
 if(role==='admin')return [...base,
  {label:'Orders',path:'/admin/orders',id:'orders',group:'Daily work'},
  {label:'Customers',path:'/admin/customers',id:'customers',group:'Daily work'},
  {label:'Inquiries',path:'/staff/inquiries',id:'inquiries',group:'Daily work'},
  {label:'Quotes',path:'/admin/quotes',id:'quotes',group:'Daily work'},
  {label:'Warehouse',path:'/admin/fulfillment',id:'fulfillment',group:'Daily work'},
  {label:'Approvals & release',path:'/admin/decisions',id:'decisions',group:'Daily work'},
  {label:'Finance',path:'/admin/finance',id:'finance',group:'Daily work'}];
 if(role==='finance')return [...base,{label:'Approvals & release',path:'/admin/decisions',id:'decisions',group:'Daily work'},{label:'Invoices & payments',path:'/admin/finance',id:'finance',group:'Daily work'},{label:'Refund reviews',path:'/admin/refund-reviews',id:'refund-reviews',group:'Daily work'}];
 if(role?.startsWith('warehouse_'))return [...base,{label:'Receive a delivery',path:'/admin/inventory/receive',id:'receiving',group:'Daily work'}];
 if(['sales','sales_manager','customer_service'].includes(role))return [...base,...(inquiries?[{label:'New quote',path:'/quote/new',id:'new-quote',group:'Daily work'}]:[]),{label:'Customer workspace',path:'/rep',id:'rep',group:'Daily work'},...(inquiries?[{label:'Inquiries',path:'/staff/inquiries',id:'inquiries',group:'Daily work'}]:[])];
 return base;
}
