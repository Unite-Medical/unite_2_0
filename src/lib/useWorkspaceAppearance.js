import {useCallback,useSyncExternalStore} from 'react';
import {APPEARANCE_DEFAULTS,appearanceKey,loadAppearance,normalizeAppearance,saveAppearance} from './workspaceAppearance.js';
const cache=new Map(),memoryOnly=new Map(),eventName='unite:appearance';
function snapshot(userId){
 const key=appearanceKey(userId);
 if(memoryOnly.has(key))return memoryOnly.get(key);
 let value;
 try{value=loadAppearance(window.localStorage,userId);}catch{value={...APPEARANCE_DEFAULTS};}
 const serialized=JSON.stringify(value),previous=cache.get(key);
 if(previous?.serialized===serialized)return previous.value;
 cache.set(key,{serialized,value});return value;
}
function subscribe(listener){
 window.addEventListener(eventName,listener);
 const storage=e=>{if(e.key?.startsWith('um.workspace.appearance.v1.')){memoryOnly.delete(e.key);listener();}};
 window.addEventListener('storage',storage);
 return()=>{window.removeEventListener(eventName,listener);window.removeEventListener('storage',storage);};
}
export function useWorkspaceAppearance(userId){
 const getSnapshot=useCallback(()=>snapshot(userId),[userId]);
 const preferences=useSyncExternalStore(subscribe,getSnapshot,()=>APPEARANCE_DEFAULTS);
 const update=useCallback(patch=>{
  const next=normalizeAppearance({...snapshot(userId),...patch});let result;
  try{result=saveAppearance(window.localStorage,userId,next);}catch{result={preferences:next,persisted:false};}
  const key=appearanceKey(userId);if(result.persisted)memoryOnly.delete(key);else memoryOnly.set(key,result.preferences);
  window.dispatchEvent(new CustomEvent(eventName));
 },[userId]);
 return {preferences,update};
}
