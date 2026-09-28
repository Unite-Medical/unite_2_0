import {useEffect,useRef,useState} from 'react';
import './EditorialFilm.css';

// Scroll owns the timeline. Posters remain available before loading, on errors,
// and when a visitor requests reduced motion or reduced data usage.
export function EditorialFilm({id,eyebrow,title,description,src,poster,alt,action,exploreHref,endTitle,endCopy,credit}) {
  const section=useRef(null),video=useRef(null),sync=useRef(null);
  const [enabled,setEnabled]=useState(false),[staticMode,setStaticMode]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let observer,frame=0,active=false,progress=null,last=0;
    const update=now=>{
      frame=0;if(!active||!section.current)return;
      const rect=section.current.getBoundingClientRect();
      const target=Math.max(0,Math.min(1,-rect.top/Math.max(1,rect.height-innerHeight)));
      const elapsed=last?Math.min(64,now-last):16;last=now;
      progress=progress===null?target:progress+(target-progress)*(1-Math.exp(-elapsed/110));
      if(Math.abs(target-progress)<.0002)progress=target;
      section.current.style.setProperty('--film-progress',progress.toFixed(5));
      const el=video.current;
      if(el?.readyState>=2&&Number.isFinite(el.duration)&&!el.seeking){const time=progress*Math.max(0,el.duration-.05);if(Math.abs(el.currentTime-time)>.025)el.currentTime=time;}
      if(progress!==target)frame=requestAnimationFrame(update);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};sync.current=schedule;
    const configure=()=>{
      observer?.disconnect();active=!reduced.matches&&!navigator.connection?.saveData;setStaticMode(!active);
      if(!active){cancelAnimationFrame(frame);frame=0;setEnabled(false);section.current?.style.removeProperty('--film-progress');return;}
      observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setEnabled(true);schedule();}},{rootMargin:'300px'});
      observer.observe(section.current);schedule();
    };
    configure();addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);reduced.addEventListener('change',configure);
    return()=>{observer?.disconnect();cancelAnimationFrame(frame);sync.current=null;removeEventListener('scroll',schedule);removeEventListener('resize',schedule);reduced.removeEventListener('change',configure);};
  },[]);
  return <section ref={section} id={id} className={`ed-film${staticMode||failed?' is-static':''}`} aria-labelledby={`${id}-title`}>
    <div className="ed-film-stage">
      <div className="ed-film-media"><img src={poster} alt={alt} fetchPriority="high"/>{enabled&&!failed&&<video ref={video} src={src} poster={poster} muted playsInline preload="auto" aria-hidden="true" onLoadedData={()=>sync.current?.()} onSeeked={()=>sync.current?.()} onError={()=>setFailed(true)}/>}</div>
      <div className="ed-film-shade"/>
      <div className="ed-film-opening"><p className="ed-kicker">{eyebrow}</p><h1 id={`${id}-title`}>{title}</h1><p className="ed-film-description">{description}</p><a className="ed-film-cta" href={action.href}>{action.label}<span aria-hidden="true">↗</span></a></div>
      <div className="ed-film-ending" aria-hidden="true"><span className="ed-kicker">A CLOSER LOOK</span><p>{endTitle}</p><small>{endCopy}</small></div>
      <div className="ed-film-bottom"><a href={exploreHref||action.href}>Scroll to explore <span aria-hidden="true">↓</span></a><span className="ed-film-timeline" aria-hidden="true"><i/></span><small>{credit||'AI-generated conceptual film'}</small></div>
    </div>
  </section>;
}

