import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ensureRecoverySchema,reserveRecoveryAttempt,redeemRecovery,recoveryDigest} from '../api/_lib/passwordRecovery.js';
import {hashStoredPassword,verifyStoredPassword} from '../api/_lib/auth.js';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const sql=async (strings,...values)=>(await db.query(strings.reduce((s,t,i)=>s+t+(i<values.length?`$${i+1}`:''),''),values)).rows;
try {
 await sql`CREATE TABLE um_rows(tbl text,id text,data jsonb,deleted boolean DEFAULT false,updated_at timestamptz DEFAULT now(),PRIMARY KEY(tbl,id))`;
 await ensureRecoverySchema(sql);
 const profile={id:'qa',status:'active',session_revision:0,...hashStoredPassword('original-password')};
 await sql`INSERT INTO um_rows(tbl,id,data) VALUES ('profiles','qa',${JSON.stringify(profile)})`;
 const issue=async({revision=0,expires=new Date(Date.now()+60000).toISOString()}={})=>{const t=crypto.randomBytes(32).toString('base64url');await sql`INSERT INTO um_password_resets(token_hash,user_id,revision,expires_at) VALUES (${recoveryDigest(t)},'qa',${revision},${expires})`;return t;};
 const token=await issue(),second=await issue(),record=hashStoredPassword('replacement-password');
 const concurrent=await Promise.all([redeemRecovery(sql,token,record),redeemRecovery(sql,token,record)]);
 assert.equal(concurrent.filter(r=>r.length).length,1,'only one concurrent redemption wins');
 assert.equal((await redeemRecovery(sql,second,record)).length,0,'other outstanding links revoked');
 const [changed]=await sql`SELECT data FROM um_rows WHERE id='qa'`;
 assert.equal(changed.data.session_revision,1);assert.equal(verifyStoredPassword(changed.data,'replacement-password'),true);assert.equal(verifyStoredPassword(changed.data,'original-password'),false);
 const expired=await issue({revision:1,expires:new Date(Date.now()-60000).toISOString()});assert.equal((await redeemRecovery(sql,expired,record)).length,0);
 const inactive=await issue({revision:1});await sql`UPDATE um_rows SET data=data || '{"status":"inactive"}'::jsonb WHERE id='qa'`;assert.equal((await redeemRecovery(sql,inactive,record)).length,0);
 const allowed=await Promise.all(Array.from({length:7},()=>reserveRecoveryAttempt(sql,'qa-limit',3)));assert.equal(allowed.filter(Boolean).length,3);
 await sql`UPDATE um_password_reset_limits SET window_start=now()-interval '2 hours' WHERE key='qa-limit'`;assert.equal(await reserveRecoveryAttempt(sql,'qa-limit',3),true);
 console.log('PASS: actual PostgreSQL recovery SQL, concurrent single use, session/link revocation, expired/inactive rejection, password replacement, atomic rate limiting and window rollover.');
}finally{await db.close();}
