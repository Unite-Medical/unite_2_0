export function planInquiryReview(row,input,actor,now=new Date()){
 if(!row)return {ok:false,error:'inquiry_not_found'};
 if(Number(input.version)!==Number(row.review_version||0))return {ok:false,error:'inquiry_changed_refresh'};
 if(!['pending_review','in_progress','waiting','closed'].includes(input.status))return {ok:false,error:'invalid_inquiry_status'};
 const note=String(input.note||'').trim();
 if(!note)return {ok:false,error:'inquiry_note_required'};
 return {ok:true,row:{...row,status:input.status,review_note:note.slice(0,4000),review_version:Number(row.review_version||0)+1,reviewed_by:actor.user_id,reviewed_by_name:actor.name||actor.email,reviewed_at:now.toISOString()}};
}
