import {useEffect} from 'react';

export function useEditorialReveal(ref) {
  useEffect(()=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||!ref.current)return;
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.08});
    const nodes=ref.current.querySelectorAll('.ed-reveal');nodes.forEach(node=>{node.classList.add('will-reveal');observer.observe(node);});
    return()=>{observer.disconnect();nodes.forEach(node=>node.classList.remove('will-reveal'));};
  },[ref]);
}
