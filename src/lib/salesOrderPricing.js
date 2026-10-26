const cents=value=>Math.round(Number(value)*100)/100;
export function calculateSalesLinePrice(basePrice,itemDiscount=null,orderDiscount=0){
 const base=cents(basePrice),order=Number(orderDiscount);
 if(!Number.isFinite(base)||base<=0||base>100000000)throw new Error('Enter a customer price greater than $0.00.');
 if(!Number.isFinite(order)||order<0||order>=100)throw new Error('Order discount must be between 0% and less than 100%.');
 if(itemDiscount!=null&&(typeof itemDiscount!=='object'||Array.isArray(itemDiscount)))throw new Error('Choose a valid item discount.');
 const type=itemDiscount?.type||'percent';
 if(!['percent','amount'].includes(type))throw new Error('Choose a percentage or USD-per-unit item discount.');
 const value=cents(itemDiscount?.value??0);
 if(!Number.isFinite(value)||value<0||(type==='percent'&&value>=100))throw new Error('Enter an item discount of 0 or more, below 100%.');
 const itemAmount=type==='percent'?cents(base*value/100):value;
 if(itemAmount>=base)throw new Error('The item discount must leave a price greater than $0.00.');
 const afterItem=cents(base-itemAmount),effective=cents(afterItem*(1-order/100));
 if(effective<=0)throw new Error('The customer price after discounts must be greater than $0.00.');
 return {base_unit_price:base,item_discount_per_unit:itemAmount,after_item_discount:afterItem,unit_price:effective,order_discount_per_unit:cents(afterItem-effective),line_discount:{type,value,reason:String(itemDiscount?.reason||'').trim().slice(0,300)}};
}
