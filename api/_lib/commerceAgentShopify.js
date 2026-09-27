import {SERVICES} from './services.js';
export const SHOPIFY_MCP_TOOLS=[
 {type:'mcp',server_label:'unite_shopify_policies',transport:{type:'http',server_url:'https://unite-medical.myshopify.com/api/mcp'},allowed_tools:['search_shop_policies_and_faqs'],required:false},
];
// Fixed read queries. The agent cannot submit arbitrary GraphQL or Shopify mutations.
const queries={
 customers:`query($query:String!,$after:String){customers(first:30,after:$after,query:$query){nodes{id displayName email phone tags note taxExempt numberOfOrders defaultAddress{address1 address2 city provinceCode zip countryCodeV2 company firstName lastName}} pageInfo{hasNextPage endCursor}}}`,
 orders:`query($query:String!,$after:String){orders(first:30,after:$after,query:$query,sortKey:CREATED_AT,reverse:true){nodes{id name createdAt displayFinancialStatus displayFulfillmentStatus email note tags currentTotalPriceSet{shopMoney{amount currencyCode}} customer{id displayName} lineItems(first:50){nodes{id name sku quantity currentQuantity originalUnitPriceSet{shopMoney{amount currencyCode}}}}} pageInfo{hasNextPage endCursor}}}`,
 products:`query($query:String!,$after:String){products(first:30,after:$after,query:$query){nodes{id title status variants(first:50){nodes{id title sku price inventoryQuantity}}} pageInfo{hasNextPage endCursor}}}`,
};
export function shopifyAdminConfigured(){return SERVICES.shopify.configured();}
export async function readLiveShopify({kind,query='',cursor=''}){
 if(!queries[kind])throw new Error('Choose customers, orders or products.');
 if(!shopifyAdminConfigured())return {connected:false,source:'Shopify Admin',message:'Private live Shopify customer/order access is not connected. Configure the store Admin API credentials in server settings. The public catalog MCP and imported records are separate sources.'};
 try{const response=await fetch(SERVICES.shopify.buildUrl('/admin/api/'+(process.env.SHOPIFY_API_VERSION||'2026-04')+'/graphql.json',{}),{method:'POST',headers:await SERVICES.shopify.headers(),body:JSON.stringify({query:queries[kind],variables:{query:String(query).slice(0,300),after:cursor||null}}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Shopify connection returned '+response.status);const result=await response.json();if(result.errors?.length)throw new Error(result.errors.map(e=>e.message).join('; '));return {connected:true,source:'Live Shopify Admin',retrieved_at:new Date().toISOString(),...result.data[kind]};}catch{return {connected:false,source:'Shopify Admin',message:'The private Shopify connection needs attention.'};}
}

// Shopify's UCP catalog does not negotiate a generic remote-MCP initialization.
// Call its documented JSON-RPC tool endpoint through this fixed server-side adapter.
export async function searchShopifyCatalog({query,cursor=''}){
 const response=await fetch('https://unite-medical.myshopify.com/api/ucp/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_catalog',arguments:{meta:{'ucp-agent':{profile:'https://staging.unitemedical.net/.well-known/unite-agent.json'}},catalog:{query:String(query||'').slice(0,250),pagination:{limit:8,...(cursor?{cursor:String(cursor).slice(0,500)}:{})}}}}}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('The live Shopify catalog is temporarily unavailable.');
 const result=await response.json();if(result.error||result.result?.isError)throw new Error('Shopify catalog lookup could not complete.');
 const content=result.result?.structuredContent||result.result?.content?.filter(c=>c.type==='text').map(c=>{try{return JSON.parse(c.text);}catch{return c.text;}});
 return {source:'Live Shopify public catalog MCP',currency_note:'Monetary amounts are minor currency units; USD values are cents. These are public catalog prices, not customer-specific agreements.',data:content&&typeof content==='object'&&!Array.isArray(content)?{products:content.products?.map(p=>({id:p.id,title:p.title,url:p.url,price_range:p.price_range,variants:p.variants?.map(({id,title,sku,price,availability})=>({id,title,sku,price,availability})),options:p.options})),pagination:content.pagination,messages:content.messages}:content};
}
