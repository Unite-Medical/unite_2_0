export function projectSyncPage(rows,{since=null,serviceAccess=false,cutoff}={}){
  const more=rows.length>500,page=rows.slice(0,500),tables={};
  let latest=since?since.toISOString():null;
  for(const r of page){
    if(!serviceAccess&&['organization_merge_audits','auth_login_limits','telemetry_limits','staging_before_images','activation_tokens'].includes(r.tbl))continue;
    const projected={...r.data};
    if(!serviceAccess&&r.tbl==='profiles')for(const key of ['password','password_hash','password_salt','password_algorithm','mfa_secret'])delete projected[key];
    (tables[r.tbl]||=[]).push(since?{...projected,__deleted:r.deleted}:projected);
    const at=new Date(r.updated_at).toISOString();if(!latest||at>latest)latest=at;
  }
  const last=page.at(-1);
  const next_cursor=more?Buffer.from(JSON.stringify({cutoff,at:last.cursor_at,table:last.tbl,id:last.id})).toString('base64url'):null;
  return {tables,latest:more?latest:cutoff,row_count:page.length,next_cursor};
}
