import crypto from 'node:crypto';

const FIELDS = ['label','recipient','company','line1','line2','city','state','zip','country'];
export function validateCustomerAddress(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !FIELDS.includes(key))) return null;
  const address = {};
  for (const field of FIELDS) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > (field.startsWith('line') ? 200 : 120) || [...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)) return null;
    address[field] = value.trim();
  }
  address.country = address.country.toUpperCase();
  if (!['label','recipient','line1','city','state','zip','country'].every(field => address[field])) return null;
  if (!/^[A-Z]{2}$/.test(address.country) || address.zip.length > 20) return null;
  if (address.country === 'US' && (!/^[A-Za-z]{2}$/.test(address.state) || !/^\d{5}(?:-\d{4})?$/.test(address.zip))) return null;
  return address;
}
export function buildCustomerAddress({input,session,key,now=new Date()}) {
  const fields=validateCustomerAddress(input);
  if (!fields || !session?.org_id || !/^[A-Za-z0-9_-]{16,128}$/.test(String(key||''))) return null;
  const id='adr_'+crypto.createHash('sha256').update(session.org_id+':'+key).digest('hex').slice(0,24);
  return {id,org_id:session.org_id,...fields,is_default:false,created_by:session.user_id,created_at:now.toISOString(),updated_at:now.toISOString()};
}
export function sameCustomerAddress(a,b) {
  return a?.org_id===b?.org_id && FIELDS.every(field=>(a?.[field]||'')===(b?.[field]||''));
}
