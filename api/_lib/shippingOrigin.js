export function shippingOrigin(env=process.env){
 const origin={name:'Unite Medical',company:'Unite Medical',street1:env.UNITE_SHIP_FROM_STREET,city:env.UNITE_SHIP_FROM_CITY,state:env.UNITE_SHIP_FROM_STATE,postalCode:env.UNITE_SHIP_FROM_ZIP,country:env.UNITE_SHIP_FROM_COUNTRY||'US'};
 return validShippingOrigin(origin)?origin:null;
}
export function validShippingOrigin(origin){return !!origin&&['street1','city','state','postalCode','country'].every(k=>typeof origin[k]==='string'&&origin[k].trim().length>0);}
