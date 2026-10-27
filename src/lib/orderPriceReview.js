import {calculateSalesLinePrice} from './salesOrderPricing.js';
const cents=value=>Math.round(Number(value)*100)/100;
export function orderPriceChange({price,cost,product,updateCatalogCost=false,discount=0,lineDiscount=null,catalogPrice=product?.retail}){
 const unit=cents(price);
 if(String(price??'').trim()===''||!Number.isFinite(unit)||unit<=0||unit>100000000)throw new Error('Enter a customer price greater than $0.00.');
 const existing=Number.isFinite(Number(product?.cost))&&Number(product?.cost)>0?Number(product.cost):null;
 const provided=String(cost??'').trim()===''?null:cents(cost);
 const costChanged=updateCatalogCost&&provided!==existing;
 if(costChanged&&!product)throw new Error('Load the product before updating its catalog cost.');
 if(costChanged&&(!Number.isFinite(provided)||provided<=0||provided>100000000))throw new Error('Enter a verified internal cost greater than $0.00.');
 const pct=Number(discount);
 if(!Number.isFinite(pct)||pct<0||pct>=100)throw new Error('Discount must be between 0% and less than 100%.');
 const calculated=calculateSalesLinePrice(unit,lineDiscount,pct),effective=calculated.unit_price;
 if(effective<=0)throw new Error('The customer price after discount must be greater than $0.00.');
 const basis=costChanged?provided:existing;
 return {unit_price:unit,manual_price:unit!==Number(catalogPrice),line_discount:calculated.line_discount,effective_price:effective,item_discount_per_unit:calculated.item_discount_per_unit,costPatch:costChanged?{cost:provided}:null,gross_margin:basis>0?(effective-basis)/effective:null};
}
