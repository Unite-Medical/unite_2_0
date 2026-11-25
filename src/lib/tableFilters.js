export const filterOptions=(pairs)=>pairs.map(([value,label])=>({value,label}));
const PAYMENT_OPTIONS=filterOptions([['paid','Paid'],['partially_paid','Partially paid'],['unpaid','Unpaid'],['payment_review_needed','Payment review needed']]);
const FULFILLMENT_OPTIONS=filterOptions([['unfulfilled','Unfulfilled'],['partial','Partially fulfilled'],['fulfilled','Fulfilled'],['restocked','Restocked']]);
export const ORDER_FILTERS=[{id:'payment',label:'Payment',options:PAYMENT_OPTIONS},{id:'fulfillment',label:'Fulfillment',options:FULFILLMENT_OPTIONS},{id:'origin',label:'Source',options:filterOptions([['new','Created in Unite'],['imported','Imported from Shopify']])},{id:'tag',label:'Tag',options:filterOptions([['b2b','b2b'],['amerisourcebergen','AmerisourceBergen'],['mirakl','Mirakl'],['temu','TEMU']])},{id:'created_from',label:'From',type:'date'},{id:'created_to',label:'To',type:'date'}];
const localDay=(v,days=0)=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||'');return m?new Date(+m[1],m[2]-1,+m[3]+days).toISOString():'';};
// Date filters use the viewer's local day, matching how order dates are displayed.
export const facetQuery=(values)=>Object.fromEntries(Object.entries(values).filter(([,v])=>v).map(([k,v])=>[k,k==='created_from'?localDay(v):k==='created_to'?localDay(v,1):v]));
