import {useEffect,useRef} from 'react';
export function useDetailFocus(id){
 const ref=useRef(null);
 useEffect(()=>{if(window.matchMedia('(max-width: 1200px)').matches){ref.current?.focus({preventScroll:true});ref.current?.scrollIntoView({block:'start',behavior:'instant'});}},[id]);
 return ref;
}
