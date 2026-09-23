import crypto from 'node:crypto';
// RFC 4226 / RFC 6238. All stored secrets are AES-256-GCM sealed.
export function requiresMfa(role){return (Array.isArray(role)?role:[role]).some(r=>['admin','finance','warehouse_manager','sales_manager','sourcing_manager'].includes(r));}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
export function decode32(value){let bits=0,n=0;const out=[];for(const c of value.toUpperCase().replace(/=+$/,'')){const v=alphabet.indexOf(c);if(v<0)throw new Error('invalid_key');n=(n<<5)|v;bits+=5;if(bits>=8){out.push((n>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,counter,digits=6){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));const mac=crypto.createHmac('sha1',decode32(secret)).update(b).digest();const offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');}
export function verifyTotp(secret,code,{now=Date.now(),lastCounter=-1}={}){if(!/^\d{6}$/.test(String(code)))return null;const current=Math.floor(now/30000);for(const counter of [current,current-1,current+1]){if(counter<=lastCounter||counter<0)continue;if(crypto.timingSafeEqual(Buffer.from(totp(secret,counter)),Buffer.from(String(code))))return counter;}return null;}
function key(){const value=process.env.MFA_ENCRYPTION_KEY;if(!/^[a-f0-9]{64}$/i.test(value||''))throw new Error('mfa_encryption_not_configured');return Buffer.from(value,'hex');}
export function sealMfa(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv);const encrypted=Buffer.concat([c.update(value,'utf8'),c.final()]);return [iv,c.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');}
export function openMfa(value){const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,'base64url'));const c=crypto.createDecipheriv('aes-256-gcm',key(),iv);c.setAuthTag(tag);return Buffer.concat([c.update(data),c.final()]).toString('utf8');}
export function digestToken(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
export async function ensureMfaSchema(sql){
 await sql`CREATE TABLE IF NOT EXISTS um_mfa_credentials(user_id text PRIMARY KEY,secret text NOT NULL,last_counter bigint NOT NULL DEFAULT -1,recovery_hashes jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now())`;
 await sql`CREATE TABLE IF NOT EXISTS um_mfa_challenges(user_id text PRIMARY KEY,token_hash text NOT NULL,secret text,revision integer NOT NULL,attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL)`;
}
export async function beginMfa(sql,profile){
 await ensureMfaSchema(sql);
 const existing=await sql`SELECT user_id FROM um_mfa_credentials WHERE user_id=${profile.id}`;
 const secret=existing.length?null:base32(crypto.randomBytes(20));
 // Validate encryption config even for existing accounts; do not issue unusable challenges.
 key();
 const token=crypto.randomBytes(32).toString('base64url');
 await sql`INSERT INTO um_mfa_challenges(user_id,token_hash,secret,revision,attempts,expires_at) VALUES(${profile.id},${digestToken(token)},${secret?sealMfa(secret):null},${Number(profile.session_revision||0)},0,now()+interval '5 minutes') ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,secret=EXCLUDED.secret,revision=EXCLUDED.revision,attempts=CASE WHEN um_mfa_challenges.expires_at>now() THEN um_mfa_challenges.attempts ELSE 0 END,expires_at=CASE WHEN um_mfa_challenges.expires_at>now() THEN um_mfa_challenges.expires_at ELSE EXCLUDED.expires_at END`;
 return {mfa_required:true,challenge:token,enrollment:!existing.length,...(secret?{setup_key:secret,issuer:'Unite Medical',account:profile.email}:{})};
}
