import {useNavigate,useSearchParams} from 'react-router-dom';
import {AdminShell} from '../../components/layout/AdminShell.jsx';
import {CommerceAssistant} from '../../components/commerce/CommerceAssistant.jsx';
import {auth} from '../../lib/auth.js';
import {useSEO} from '../../lib/seo.js';
import '../../styles/commerce-workspace.css';
import '../../styles/chat-workspace.css';
export function CommerceChat(){const session=auth.use(),navigate=useNavigate(),[params]=useSearchParams();useSEO({title:'Chat',noindex:true});return <AdminShell active="chat"><main id="main" className="uc-page"><CommerceAssistant key={(session?.user_id||'')+':'+(params.get('chat')||'')+':'+(params.get('prompt')||'')} workspace newConversation={Boolean(params.get('prompt'))} initialQuestion={params.get('prompt')||''} initialSessionId={params.get('chat')||''} userId={session?.user_id} context="/admin/chat" onSelected={kind=>navigate('/admin/'+kind+'?selected=1')}/></main></AdminShell>;}
