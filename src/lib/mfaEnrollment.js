// This URI stays in browser memory. Never send it to a QR service or telemetry.
export function mfaEnrollmentUri({setup_key,issuer='Unite Medical',account}={}) {
  if(!/^[A-Z2-7]{16,128}$/.test(setup_key||'')||typeof account!=='string'||!account.trim()||account.length>254||typeof issuer!=='string'||!issuer.trim()||issuer.length>80)throw new Error('Authenticator setup is unavailable. Sign in again.');
  const label=encodeURIComponent(issuer.trim())+':'+encodeURIComponent(account.trim());
  const params=new URLSearchParams({secret:setup_key,issuer:issuer.trim(),algorithm:'SHA1',digits:'6',period:'30'});
  return 'otpauth://totp/'+label+'?'+params.toString();
}
