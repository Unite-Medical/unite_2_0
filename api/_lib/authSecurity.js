import crypto from 'node:crypto';
import {readRawBody} from './http.js';
export const AUTH_ACTION_TTL_MS=5*60*1000;
export const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
export const randomToken=()=>crypto.randomBytes(32).toString('base64url');
export const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function authOrigin(env=process.env){
 const value=String(env.UNITE_AUTH_ORIGIN||'').trim();
 let url;try{url=new URL(value);}catch{throw new Error('auth_origin_not_configured');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.origin!==value.replace(/\/$/,''))throw new Error('auth_origin_not_configured');
 const mode=env.UNITE_ENVIRONMENT||env.VITE_UNITE_ENVIRONMENT;
 if(url.hostname==='staging.unitemedical.net'&&(mode==='production'||(env.VERCEL_ENV==='production'&&mode!=='staging'&&env.VERCEL_PROJECT_ID!=='prj_PL5BOZooLBtLiPQlrn34SyC0MRKS')))throw new Error('auth_origin_environment_mismatch');
 return url.origin;
}
export async function authBody(req,env=process.env){
 if(req.method!=='POST')throw new Error('method_not_allowed');
 if(req.headers?.origin!==authOrigin(env)||!String(req.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))throw new Error('same_origin_json_required');
 const raw=await readRawBody(req);if(raw.length>12000)throw new Error('request_too_large');
 let body;try{body=JSON.parse(raw.toString('utf8'));}catch{throw new Error('invalid_request');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid_request');return body;
}
export const requestIp=req=>String(req.headers?.['x-vercel-forwarded-for']||req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
export function securityHeaders(res){res.setHeader('Cache-Control','no-store, private');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');}
export async function securitySchema(sql){
 await sql`CREATE TABLE IF NOT EXISTS um_auth_mail(id text PRIMARY KEY,user_id text NOT NULL,kind text NOT NULL,revision integer NOT NULL,payload text NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,next_attempt_at timestamptz NOT NULL DEFAULT now(),claimed_at timestamptz,claim text,sent_at timestamptz)`;
 await sql`CREATE TABLE IF NOT EXISTS um_mfa_replacements(id text PRIMARY KEY,user_id text NOT NULL,email text NOT NULL,kind text NOT NULL,token_hash text NOT NULL,revision integer NOT NULL,credential_hash text NOT NULL,secret text,flow_hash text,flow_expires_at timestamptz,attempts integer NOT NULL DEFAULT 0,actor_id text NOT NULL,actor_revision integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`;
}

const visibleErrors=new Set(['password_or_authenticator_invalid','records_changed_sign_in_again','another_administrator_required_for_lost_factor','eligible_staff_account_required','confirm_exact_account_and_identity_review','account_not_enrolled_use_normal_sign_in','recovery_expired_or_invalid','recovery_password_invalid','confirm_authenticator_and_session_replacement','verify_password_before_enrollment','new_authenticator_code_invalid','same_origin_json_required','request_too_large','invalid_request']);
export const securityError=error=>visibleErrors.has(error?.message)?error.message:'recovery_unavailable';
