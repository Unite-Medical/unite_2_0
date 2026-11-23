import {generateAuthenticationOptions,generateRegistrationOptions,verifyAuthenticationResponse,verifyRegistrationResponse} from '@simplewebauthn/server';
// Passkeys (WebAuthn) are the preferred second factor; TOTP stays as the backup.
export function relyingParty(req){
 const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'').split(',')[0].trim().toLowerCase();
 const hostname=host.replace(/:\d+$/,'');
 const local=hostname==='localhost'||hostname==='127.0.0.1';
 return {rpID:process.env.WEBAUTHN_RP_ID||hostname,origin:process.env.WEBAUTHN_ORIGIN||`${local?'http':'https'}://${host}`};
}
export async function ensurePasskeySchema(sql){
 await sql`CREATE TABLE IF NOT EXISTS um_passkeys(id text PRIMARY KEY,user_id text NOT NULL,public_key text NOT NULL,counter bigint NOT NULL DEFAULT 0,transports jsonb NOT NULL DEFAULT '[]',device_type text,backed_up boolean NOT NULL DEFAULT false,name text,created_at timestamptz NOT NULL DEFAULT now(),last_used_at timestamptz)`;
 await sql`CREATE INDEX IF NOT EXISTS um_passkeys_user_idx ON um_passkeys(user_id)`;
 await sql`ALTER TABLE um_passkeys ADD COLUMN IF NOT EXISTS rp_id text`;
 await sql`CREATE TABLE IF NOT EXISTS um_passkey_challenges(user_id text PRIMARY KEY,challenge text NOT NULL,expires_at timestamptz NOT NULL)`;
 await sql`ALTER TABLE um_mfa_challenges ADD COLUMN IF NOT EXISTS webauthn_challenge text`;
}
export function listPasskeys(sql,userId,rpID=null){return rpID?sql`SELECT id,public_key,counter,transports,name,created_at,last_used_at FROM um_passkeys WHERE user_id=${userId} AND (rp_id IS NULL OR rp_id=${rpID}) ORDER BY created_at`:sql`SELECT id,public_key,counter,transports,name,created_at,last_used_at FROM um_passkeys WHERE user_id=${userId} ORDER BY created_at`;}
export function publicPasskey(p){return {id:p.id,name:p.name||'Passkey',created_at:p.created_at,last_used_at:p.last_used_at};}
export function passkeySignInOptions(rp,passkeys){
 return generateAuthenticationOptions({rpID:rp.rpID,allowCredentials:passkeys.map(p=>({id:p.id,transports:p.transports||[]})),userVerification:'preferred',timeout:120000});
}
export async function verifyPasskeySignIn({rp,response,expectedChallenge,passkey}){
 const result=await verifyAuthenticationResponse({response,expectedChallenge,expectedOrigin:rp.origin,expectedRPID:rp.rpID,requireUserVerification:false,
  credential:{id:passkey.id,publicKey:new Uint8Array(Buffer.from(passkey.public_key,'base64url')),counter:Number(passkey.counter||0),transports:passkey.transports||[]}});
 return result.verified?result.authenticationInfo:null;
}
export function passkeyRegistrationOptions(rp,profile,passkeys){
 return generateRegistrationOptions({rpName:'Unite Medical',rpID:rp.rpID,userName:profile.email,userDisplayName:profile.name||profile.email,userID:new TextEncoder().encode(String(profile.id)),
  attestationType:'none',excludeCredentials:passkeys.map(p=>({id:p.id,transports:p.transports||[]})),authenticatorSelection:{residentKey:'preferred',userVerification:'preferred'},timeout:120000});
}
export async function verifyPasskeyRegistration({rp,response,expectedChallenge}){
 const result=await verifyRegistrationResponse({response,expectedChallenge,expectedOrigin:rp.origin,expectedRPID:rp.rpID,requireUserVerification:false});
 if(!result.verified||!result.registrationInfo)return null;
 const {credential,credentialDeviceType,credentialBackedUp}=result.registrationInfo;
 return {id:credential.id,public_key:Buffer.from(credential.publicKey).toString('base64url'),counter:Number(credential.counter||0),transports:credential.transports||response?.response?.transports||[],device_type:credentialDeviceType,backed_up:Boolean(credentialBackedUp)};
}
export function defaultPasskeyName(userAgent=''){
 const ua=String(userAgent);
 const device=/iPhone/.test(ua)?'iPhone':/iPad/.test(ua)?'iPad':/Android/.test(ua)?'Android':/Mac OS X|Macintosh/.test(ua)?'Mac':/Windows/.test(ua)?'Windows PC':/CrOS/.test(ua)?'Chromebook':'This device';
 const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'';
 return browser?`${device} · ${browser}`:device;
}
