import {get} from '@vercel/blob';
import {WELL_DOCUMENTS} from './welllink.js';

// Called only after live staff authorization; never return storage URLs or tokens.
export async function readWellDocument(id,{getBlob=get}={}) {
  const doc=WELL_DOCUMENTS.find(item=>item.id===id);
  if(!doc)throw new Error('document_not_found');
  const blob=await getBlob(`welllink/${doc.file}`,{access:'private'});
  if(!blob||blob.statusCode!==200)throw new Error('document_unavailable');
  return Buffer.from(await new Response(blob.stream).arrayBuffer());
}
