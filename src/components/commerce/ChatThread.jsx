import {chatText,chatTurns} from '../../lib/commerceChatState.js';
import {RichText} from './ChatRichText.jsx';
import {UMLogoMark} from '../shared/Logo.jsx';
import {WorkspaceIcon} from '../workspace/WorkspaceIcon.jsx';

function Activity({turn,busy}){
 const complete=turn.steps.filter(s=>['complete','completed'].includes(s.status)).length;
 const failed=turn.steps.some(s=>s.status==='failed');
 if(!turn.steps.length&&!turn.progress.length&&!busy)return null;
 const label=busy?(turn.steps.findLast(s=>s.status==='working')?.label||'Working…'):failed?'Activity · needs attention':complete?`${complete} ${complete===1?'step':'steps'} completed`:'Activity';
 return <details className="ua-activity ua-turn-activity"><summary><span className={busy?'ua-live-dot':'ua-done-dot'}/>{label}<WorkspaceIcon name="chevron" size={13}/></summary><div>{turn.progress.map(p=><div className="ua-progress-note" key={p.id}><RichText text={chatText(p)}/></div>)}<ol>{turn.steps.map(s=><li key={s.id} className={s.status}><WorkspaceIcon name={['complete','completed'].includes(s.status)?'check':s.status==='failed'?'close':'clock'} size={14}/><span>{s.label}{s.status==='failed'&&<small>{s.detail}</small>}</span></li>)}</ol></div></details>;
}

export function ChatThread({items,cards,steps,busy,renderCard,onCopy,copyNotice,onCanvas}){
 const {turns,earlier}=chatTurns(items,cards,steps);
 return <div className="ua-thread">{(earlier.cards.length>0||earlier.steps.length>0)&&<details className="ua-earlier-artifacts"><summary>Saved files & actions · {earlier.cards.length+earlier.steps.length}</summary>{earlier.cards.map(renderCard)}<Activity turn={earlier}/></details>}{turns.map((turn,index)=>{
  const text=turn.messages.map(chatText).filter(Boolean).join('\n\n');
  const working=busy&&index===turns.length-1;
  return <section className="ua-conversation-turn" key={turn.id} aria-label="Conversation turn">
   {turn.user&&<div className="cw-chat-message user"><span className="ua-user-text">{chatText(turn.user)}</span></div>}
   {(text||working||turn.cards.length>0||turn.steps.length>0||turn.progress.length>0)&&<div className="ua-answer">
    <Activity turn={turn} busy={working}/>
    <div className="ua-answer-content">
     <div className="ua-answer-avatar" aria-hidden="true"><UMLogoMark size={25}/></div>
     <div className="ua-answer-main">
      {text&&<div className="cw-chat-message assistant"><RichText text={text}/></div>}
      {!text&&working&&<div className="ua-typing" role="status" aria-label="Unite is working"><i/><i/><i/></div>}
      {turn.cards.map(renderCard)}
      {text&&!working&&<div className="uc-message-actions"><button aria-label="Copy response" title="Copy response" onClick={()=>onCopy(text,turn.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/></svg>{copyNotice===turn.id&&<span>Copied</span>}</button>{onCanvas&&<button onClick={()=>onCanvas(text,'Conversation notes')}>Open in canvas ↗</button>}</div>}
     </div>
    </div>
   </div>}
  </section>;
 })}</div>;
}
