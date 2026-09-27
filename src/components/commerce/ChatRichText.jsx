import {Link} from 'react-router-dom';
import {useState} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {chatHref} from '../../lib/commerceChatState.js';
function CodeBlock({children}){
 const [copied,setCopied]=useState(false);
 const content=children?.props?.children||'',language=children?.props?.className?.replace('language-','')||'Text';
 return <div className="ua-code-block"><div><span>{language}</span><button onClick={async()=>{try{await navigator.clipboard.writeText(String(content));setCopied(true);}catch{setCopied(false);}}}>{copied?'Copied':'Copy code'}</button></div><pre>{children}</pre></div>;
}
export function RichText({text}){return <div className="ua-rich-text"><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={chatHref} components={{a:({href,children})=>!href?<span>{children}</span>:href.startsWith('/admin/')?<Link to={href}>{children}</Link>:<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,img:({alt})=><span>{alt||'Image'}</span>,pre:CodeBlock,table:({children})=><div className="cw-chat-table" role="region" aria-label="Response table" tabIndex={0}><table>{children}</table></div>}}>{String(text||'')}</Markdown></div>;}
