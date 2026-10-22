export const APPEARANCE_DEFAULTS=Object.freeze({theme:'light',fontIndex:0});
export const FONT_INDEX_MIN=-1;
export const FONT_INDEX_MAX=5;
export const FONT_BASE=13;
export const appearanceKey=userId=>'um.workspace.appearance.v1.'+encodeURIComponent(String(userId||'guest'));
export function normalizeAppearance(value){
 const index=Number(value?.fontIndex);
 return {theme:value?.theme==='dark'?'dark':'light',fontIndex:Number.isInteger(index)?Math.max(FONT_INDEX_MIN,Math.min(FONT_INDEX_MAX,index)):0};
}
export function loadAppearance(storage,userId){
 try{return normalizeAppearance(JSON.parse(storage.getItem(appearanceKey(userId))||'null'));}catch{return {...APPEARANCE_DEFAULTS};}
}
export function saveAppearance(storage,userId,value){
 const preferences=normalizeAppearance(value);
 try{storage.setItem(appearanceKey(userId),JSON.stringify(preferences));return {preferences,persisted:true};}catch{return {preferences,persisted:false};}
}
export const appearanceFontSize=value=>FONT_BASE+normalizeAppearance(value).fontIndex;
