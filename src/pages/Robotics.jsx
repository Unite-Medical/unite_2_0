import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { useSEO } from '../lib/seo.js';
import { savingsDisplay } from '../lib/roboticsSavings.js';
import './robotics.css';

const TYPES = { savings: 'Savings analysis', consult: 'Consultation', collections: 'Collections', distributor: 'Represent the program' };
const MODELS = ['da Vinci Xi', 'da Vinci 5 (DV5)', 'Both', 'Not sure'];
const VOLUMES = ['< 100 instruments / yr', '100–500 / yr', '500–1,000 / yr', '1,000+ / yr', 'Not sure'];
const STEPS = [
  ['Collect', 'Start with the instruments you already use.', 'Unite helps your team establish a collection program with trays and return materials from Encore.'],
  ['Return', 'A place for every instrument.', 'Follow the program’s cleaning and packing instructions. Purpose-built trays and reusable containers protect the return journey.'],
  ['Restore', 'Put eligible instruments back to work.', 'Restore Robotics evaluates eligible instruments and remanufactures cleared models with inspection, testing and quality controls.'],
  ['Replenish', 'Keep your program moving.', 'Unite coordinates access to remanufactured and certified pre-owned inventory, with availability and pricing confirmed for your needs.'],
];
const FAQS = [
  ['Can we just collect and return expired instruments?', 'Yes. Choose Collections in the inquiry form. Unite will help coordinate the collection setup, materials and return instructions for your hospital.'],
  ['What can our facility purchase?', 'The program offers eligible remanufactured da Vinci Xi instruments and certified pre-owned inventory. We confirm the specific instrument, system compatibility, remaining uses and availability before quoting.'],
  ['How do the savings work?', 'The program targets approximately 20% savings on remanufactured instruments and 25% on certified pre-owned inventory compared with new instruments. Your savings analysis uses your product mix, usage and current pricing; actual savings vary.'],
  ['Are the instruments FDA-cleared?', 'Restore Robotics holds FDA 510(k) clearances for specific remanufactured da Vinci Xi instruments. Clearance and compatibility are instrument-specific. Ask us for the documentation for each item in your quote.'],
  ['Can we participate with a da Vinci 5 system?', 'Tell us that your facility uses da Vinci 5. The team will confirm eligible instruments and their labeling for your system before an order is placed.'],
  ['Who provides the warranty?', 'Restore Robotics is the manufacturer of record for its remanufactured instruments. We provide the applicable manufacturer warranty terms with your quote.'],
  ['How do collection and shipping work?', 'The program provides collection trays, reusable containers and return shipping. Unite will coordinate onboarding and the current handling instructions with Encore.'],
  ['Can our company represent the program?', 'Yes—choose “Represent the program” below. Tell us about the facilities or territory you serve, and Unite will follow up about the sub-distributor program.'],
];

function LeadForm({ kind, setKind }) {
  const [form, setForm] = useState({ company:'',name:'',email:'',phone:'',instrument_model:'',instrument_volume:'',message:'',website_confirm:'' });
  const [busy,setBusy] = useState(false), [saved,setSaved] = useState(null), [error,setError] = useState('');
  const lock = useRef(false), request = useRef(null), confirmation = useRef(null);
  useEffect(() => { if(saved) confirmation.current?.focus(); },[saved]);
  const set=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  async function submit(event) {
    event.preventDefault();
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    const payload={kind:'robotics',...form,inquiry_type:kind};
    const canonical=JSON.stringify(payload);
    if(request.current?.canonical!==canonical)request.current={canonical,key:crypto.randomUUID()};
    try {
      const response=await fetch('/api/public/inquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,idempotency_key:request.current.key}),signal:AbortSignal.timeout(55000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok||!result.id)throw new Error(response.status===429?'You have sent several requests. Please try again later or call 833.868.6483.':'We could not confirm your request was saved. Your details are still here. Please retry or call 833.868.6483.');
      setSaved({id:result.id,kind});
    }catch(err){setError(err.name==='TimeoutError'?'We have not received confirmation yet. Retry with the same details; this will not create a duplicate request.':err instanceof TypeError?'Could not reach Unite. Your details are still here—please try again.':err.message);}
    finally{lock.current=false;setBusy(false);}
  }
  if(saved)return <div className="ur-confirm" role="status" tabIndex={-1} ref={confirmation}><span className="ur-check" aria-hidden="true">✓</span><h3>Your request is saved.</h3><p>The Unite robotics team can now review your {saved.kind==='distributor'?'distributor inquiry':TYPES[saved.kind].toLowerCase()+' request'}. We’ll follow up using the contact details you provided.</p><p className="ur-reference">Reference: {saved.id}</p><a href="tel:+18338686483">Need to speak with us? 833.868.6483 ↗</a></div>;
  return <form className="ur-form" onSubmit={submit} aria-label="Robotics inquiry">
    <fieldset disabled={busy}><legend id="robotics-inquiry-title" tabIndex={-1}>How can we help?</legend><div className="ur-type-switch">{Object.entries(TYPES).map(([value,label])=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>setKind(value)}>{label}</button>)}</div>
      {kind==='collections'&&<p className="ur-collection-note">For hospitals that want to collect and return expired robotic instruments to Restore. We’ll help you set up the collection and return process.</p>}
      <div className="ur-fields">
        <label className="ur-wide">{kind==='distributor'?'Company':'Facility / health system'}<input autoComplete="organization" required maxLength={200} value={form.company} onChange={e=>set('company',e.target.value)}/></label>
        <label>Your name<input autoComplete="name" required maxLength={200} value={form.name} onChange={e=>set('name',e.target.value)}/></label>
        <label>Work email<input autoComplete="email" type="email" required maxLength={254} value={form.email} onChange={e=>set('email',e.target.value)}/></label>
        <label className="ur-wide">Phone <span>(optional)</span><input autoComplete="tel" type="tel" maxLength={100} value={form.phone} onChange={e=>set('phone',e.target.value)}/></label>
        {(kind==='savings'||kind==='consult')&&<><label>Robotic system<select required value={form.instrument_model} onChange={e=>set('instrument_model',e.target.value)}><option value="" disabled>Select a system</option>{MODELS.map(model=><option key={model}>{model}</option>)}</select></label><label>Annual instrument volume<select required value={form.instrument_volume} onChange={e=>set('instrument_volume',e.target.value)}><option value="" disabled>Select a range</option>{VOLUMES.map(volume=><option key={volume}>{volume}</option>)}</select></label></>}
        <label className="ur-wide">{kind==='distributor'?'Tell us about your company and territory':kind==='collections'?'Tell us about the instruments you’d like to return':'Anything else we should know?'} <span>(optional)</span><textarea rows={3} maxLength={4000} value={form.message} onChange={e=>set('message',e.target.value)}/></label>
        <label className="ur-trap" aria-hidden="true">Leave this empty<input tabIndex={-1} autoComplete="off" value={form.website_confirm} onChange={e=>set('website_confirm',e.target.value)}/></label>
      </div>
      {error&&<p role="alert" className="ur-error">{error}</p>}
      <button className="ur-button ur-submit" type="submit" disabled={busy}>{busy?'Saving your request…':kind==='savings'?'Request my savings analysis':kind==='consult'?'Request a consultation':kind==='collections'?'Request collections setup':'Talk to the program team'} <span aria-hidden="true">↗</span></button>
      <p className="ur-form-note">For business inquiries only. Please do not include patient information. <Link to="/privacy">Privacy policy</Link></p>
    </fieldset>
  </form>;
}
function HeroFilm() {
  const frame = useRef(null), video = useRef(null), userPaused = useRef(false);
  const [enabled,setEnabled] = useState(false), [playing,setPlaying] = useState(false), [failed,setFailed] = useState(false);
  useEffect(() => {
    const reduced=matchMedia('(prefers-reduced-motion: reduce)'), desktop=matchMedia('(min-width: 600px)');
    let observer;
    const configure=()=>{
      observer?.disconnect();
      if(reduced.matches || !desktop.matches || navigator.connection?.saveData){video.current?.pause();setEnabled(false);return;}
      observer=new IntersectionObserver(([entry])=>{
        if(entry.isIntersecting){setEnabled(true);if(!userPaused.current&&!document.hidden)video.current?.play().catch(()=>{});}
        else video.current?.pause();
      },{threshold:.15});
      if(frame.current)observer.observe(frame.current);
    };
    const visibility=()=>{if(document.hidden)video.current?.pause();else if(frame.current?.getBoundingClientRect().bottom>0&&!userPaused.current)video.current?.play().catch(()=>{});};
    configure();reduced.addEventListener('change',configure);desktop.addEventListener('change',configure);document.addEventListener('visibilitychange',visibility);
    return()=>{observer?.disconnect();reduced.removeEventListener('change',configure);desktop.removeEventListener('change',configure);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  const toggle=()=>{if(!video.current)return;if(video.current.paused){userPaused.current=false;video.current.play().catch(()=>{});}else{userPaused.current=true;video.current.pause();}};
  return <div className="ur-hero-film" ref={frame}><img src="/images/mobile-v1/robotics-system.webp" alt="da Vinci Xi robotic surgical system" width="1728" height="1117" fetchPriority="high"/>{enabled&&!failed&&<><video ref={video} src="/images/robotics/robotics-hero-short.mp4" poster="/images/mobile-v1/robotics-system.webp" autoPlay loop muted playsInline preload="metadata" aria-hidden="true" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>setFailed(true)}/><button className="ur-film-control" onClick={toggle} aria-label={playing?'Pause background film':'Play background film'}>{playing?'Ⅱ':'▷'} <span>{playing?'Pause':'Play'}</span></button></>}</div>;
}

// The scroll position is the timeline. This never cancels wheel/touch events.
function ScrollFilm({ children }) {
  const section = useRef(null), video = useRef(null), syncVideo = useRef(null);
  const [enabled, setEnabled] = useState(false), [failed, setFailed] = useState(false), [staticMode, setStaticMode] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = window.matchMedia('(min-width: 900px)');
    let observer, raf = 0, allowed = false, displayedProgress = null, lastFrame = 0;
    const update = (now) => {
      raf = 0;
      if (!allowed || !section.current) return;
      const bounds = section.current.getBoundingClientRect();
      const distance = Math.max(1, bounds.height - window.innerHeight);
      const targetProgress = Math.min(1, Math.max(0, -bounds.top / distance));
      const elapsed = lastFrame ? Math.min(64, now - lastFrame) : 16;
      lastFrame = now;
      // A short, time-based settle smooths trackpad/wheel jumps without autoplay.
      if (displayedProgress === null) displayedProgress = targetProgress;
      else displayedProgress += (targetProgress - displayedProgress) * (1 - Math.exp(-elapsed / 150));
      const settling = Math.abs(targetProgress - displayedProgress) > .00015;
      if (!settling) displayedProgress = targetProgress;
      const progress = displayedProgress;
      section.current.style.setProperty('--ur-progress', progress.toFixed(4));
      const element = video.current;
      if (element?.readyState >= 2 && Number.isFinite(element.duration) && !element.seeking) {
        const target = progress * Math.max(0, element.duration - .05);
        if (Math.abs(element.currentTime - target) > .025) element.currentTime = target;
      }
      if (settling) raf = requestAnimationFrame(update);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    syncVideo.current = schedule;
    const configure = () => {
      observer?.disconnect();
      allowed = !reduced.matches && desktop.matches && !navigator.connection?.saveData;
      setStaticMode(!allowed);
      if (!allowed) { cancelAnimationFrame(raf); raf = 0; displayedProgress = null; lastFrame = 0; setEnabled(false); section.current?.style.removeProperty('--ur-progress'); return; }
      observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setEnabled(true); schedule(); } }, { rootMargin: '250px 0px' });
      if (section.current) observer.observe(section.current);
      schedule();
    };
    configure();
    window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule);
    reduced.addEventListener('change', configure); desktop.addEventListener('change', configure);
    return () => { observer?.disconnect(); cancelAnimationFrame(raf); syncVideo.current = null; window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); reduced.removeEventListener('change', configure); desktop.removeEventListener('change', configure); };
  }, []);
  return <section id="robotics-system" ref={section} className={`ur-system${failed || staticMode ? ' is-static' : ''}`} aria-labelledby="robotics-system-title">
    <div className="ur-system-stage">
      <div className="ur-film ur-system-media"><img src="/images/robotics/robotics-orbit-poster.jpg" alt="Conceptual da Vinci Xi orbit visualization derived from Intuitive’s reference photograph" width="1920" height="1080" loading="lazy"/>{enabled && !failed && <video ref={video} src="/images/robotics/robotics-scroll-orbit.mp4" poster="/images/robotics/robotics-orbit-poster.jpg" muted playsInline preload="auto" aria-hidden="true" onLoadedData={() => syncVideo.current?.()} onSeeked={() => syncVideo.current?.()} onError={() => setFailed(true)}/>}</div>
      <div className="ur-system-shade" aria-hidden="true"/>
      <div className="ur-scroll-ui"><span>SCROLL TO EXPLORE ↓</span><div className="ur-scroll-track" aria-hidden="true"><i/></div><a href="#robotics-process">Continue to the workflow ↓</a></div>
      {children}
    </div>
  </section>;
}

const PATHWAYS = [
  { number: '01', image: 'hover-instrument-inspection.jpg', position: 'center 52%', title: 'Remanufactured instruments', tag: 'Instrument supply', copy: 'Explore eligible instruments remanufactured by Restore Robotics, with model-specific clearance and manufacturer warranty terms.', action: 'Review potential savings', kind: 'savings' },
  { number: '02', image: 'hover-instrument-tip.jpg', position: 'center 62%', title: 'Certified pre-owned inventory', tag: 'Additional sourcing options', copy: 'Find inventory that fits your program. Confirm system compatibility, condition, remaining uses and availability with Unite.', action: 'Discuss available inventory', kind: 'consult' },
  { number: '03', image: 'hover-collection-shipping.jpg', position: 'center 58%', title: 'Collections & returns', tag: 'For hospitals returning instruments', copy: 'Just looking to return expired instruments? Start with collections support. We’ll coordinate the setup, materials and return instructions.', action: 'Set up collections', kind: 'collections' },
];

const FEATURES = [
  {name:'Instrument supply',title:'More life. More possibility.',copy:'Explore eligible remanufactured and certified pre-owned robotic instruments for your facility.',image:'xi-instruments.jpg',action:'Explore instrument options',kind:'savings'},
  {name:'Collections & returns',title:'A new beginning starts here.',copy:'Start a collection program for expired instruments. Unite helps coordinate materials and the return process.',image:'xi-instruments.jpg',action:'Set up collections',kind:'collections'},
  {name:'Your program partner',title:'One conversation. A connected program.',copy:'From the first savings analysis to sourcing and returns, Unite helps your team take the next step.',image:'da-vinci-xi-system.jpg',action:'Talk to Unite',kind:'consult'},
];

export function Robotics() {
  const [kind,setKind]=useState('savings'),[metric,setMetric]=useState(null),[feature,setFeature]=useState(0);
  useSEO({title:'Restore Robotics · Robotic instrument program',description:'Explore remanufactured and certified pre-owned robotic instruments, collection support and a savings analysis for your facility.',canonical:'/robotics'});
  useEffect(()=>{const controller=new AbortController();fetch('/api/metrics/savings',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(setMetric).catch(()=>{});return()=>controller.abort();},[]);
  const savings=savingsDisplay(metric);
  const start=type=>()=>{setKind(type);requestAnimationFrame(()=>document.getElementById('robotics-inquiry-title')?.focus({preventScroll:true}));};
  const current=FEATURES[feature];
  return <div className="ur-page"><Nav overlay heroSelector=".ur-hero"/><main id="main">
    <section className="ur-hero" aria-labelledby="robotics-title"><HeroFilm/><div className="ur-hero-shade" aria-hidden="true"/><div className="ur-hero-title"><p>UNITE MEDICAL / RESTORE ROBOTICS</p><h1 id="robotics-title">A new life for<br/>robotic instruments.</h1></div><a className="ur-explore" href="#robotics-featured"><span aria-hidden="true">↓</span>Scroll to explore</a></section>

    <section className="ur-featured ur-container" id="robotics-featured" aria-label="Explore the robotics program"><div className="ur-feature-tabs" role="group" aria-label="Program highlights">{FEATURES.map((item,i)=><button key={item.name} aria-pressed={feature===i} onClick={()=>setFeature(i)}>{item.name}</button>)}<a href="#robotics-pathways">View program <span aria-hidden="true">↗</span></a></div><article className="ur-feature-card"><img key={current.image} src={`/images/robotics/${current.image}`} alt={feature===2?'da Vinci Xi system reference photograph':'Robotic instrument detail from Encore Medical program photography'} width="1536" height="1024" loading="lazy"/><div className="ur-feature-body"><p className="ur-eyebrow">{current.name}</p><h2>{current.title}</h2><p>{current.copy}</p><a href="#robotics-lead" onClick={start(current.kind)}>{current.action}<span aria-hidden="true">↗</span></a></div><div className="ur-feature-bottom"><span>0{feature+1} / 03</span><p>{feature===2?'System shown for context. Reference: Intuitive.':'Instrument photography: Encore Medical.'}</p><button aria-label="Previous program highlight" onClick={()=>setFeature((feature+2)%3)}>←</button><button aria-label="Next program highlight" onClick={()=>setFeature((feature+1)%3)}>→</button></div></article></section>

    <section className="ur-statement ur-container" id="robotics-overview" aria-labelledby="robotics-overview-title"><h2 id="robotics-overview-title">We help hospitals get more from their robotic instrument programs.</h2><p>From sourcing and savings<br/>to collections and returns.</p></section>

    <section className="ur-offerings ur-container" id="robotics-pathways"><div className="ur-section-label"><h2>Our program</h2><span>THREE WAYS TO START</span></div>{PATHWAYS.map(path=><a className={`ur-offering ur-offering-${path.kind}`} key={path.kind} href="#robotics-lead" onClick={start(path.kind)}><img className="ur-offering-image" src={`/images/robotics/${path.image}`} style={{objectPosition:path.position}} alt="" aria-hidden="true" loading="lazy" decoding="async"/><div className="ur-offering-copy"><h3>{path.title}</h3><p>{path.copy}</p></div><span className="ur-offering-number">/0.{path.number.slice(-1)}</span><span className="ur-offering-arrow" aria-hidden="true">↗</span></a>)}</section>

    <section className="ur-impact ur-container" aria-label="Savings and program benchmarks"><div><p className="ur-eyebrow">THE OPPORTUNITY</p><h2>Better economics.<br/>Same attention to detail.</h2></div><div className="ur-metric-grid"><div><strong>{savings.value}</strong><h3>Saved by Unite Medical accounts</h3><p>Accounts introduced through Unite’s marketing and outreach.</p><small>{savings.detail}</small></div><div><strong>~20%</strong><h3>Remanufactured instrument savings</h3><p>Compared with new instruments.</p></div><div><strong>~25%</strong><h3>Certified pre-owned savings</h3><p>Compared with new instruments. Actual savings vary by product and usage.</p></div></div></section>

    <ScrollFilm><div className="ur-container ur-system-content"><p className="ur-eyebrow">A CLOSER LOOK</p><h2 id="robotics-system-title">Precision deserves<br/>a longer story.</h2><p className="ur-system-copy">See the system in perspective.<br/>Then build the instrument program around it.</p><a className="ur-link" href="#robotics-lead" onClick={start('consult')}>Talk through your program <span aria-hidden="true">↗</span></a><small>da Vinci Xi shown for context. Based on <a href="https://www.intuitive.com/en-us/products-and-services/da-vinci/xi" target="_blank" rel="noreferrer">Intuitive’s reference photography ↗</a>.<br/>Instrument eligibility is confirmed individually.</small></div></ScrollFilm>

    <section className="ur-process ur-container" id="robotics-process"><div className="ur-section-label"><p>FROM COLLECTION TO SUPPLY</p><span>01 — 04</span></div><h2>A clear path.<br/>At every step.</h2><div className="ur-steps">{STEPS.map(([label,title,copy],i)=><article key={label}><p className="ur-eyebrow">0{i+1} / {label}</p><h3>{title}</h3><p>{copy}</p></article>)}</div><a className="ur-collection-cta" href="#robotics-lead" onClick={start('collections')}><span className="ur-eyebrow">COLLECTIONS ONLY? START HERE.</span><span className="ur-collection-title">Your instruments.<br/>Their next chapter.</span><span className="ur-collection-action">Set up a collection program <span aria-hidden="true">↗</span></span></a></section>

    <section className="ur-partners" id="robotics-partners"><div className="ur-container"><p className="ur-eyebrow">BUILT AROUND YOUR TEAM</p><h2>Three partners.<br/>One connected program.</h2>{[['Restore Robotics','Manufacturer of record','Remanufactures eligible instruments under its applicable FDA clearances and provides manufacturer warranty coverage.'],['Encore Medical','Master distributor','Coordinates collection materials and the return path to Restore Robotics.'],['Unite Medical','Your program partner','Helps assess savings, onboard your facility and coordinate instrument supply.']].map(([name,role,copy])=><article key={name}><h3>{name}</h3><div><p className="ur-eyebrow">{role}</p><p>{copy}</p></div></article>)}<a className="ur-partner-cta" href="#robotics-lead" onClick={start('distributor')}>Represent the program <span aria-hidden="true">↗</span></a></div></section>

    <section className="ur-faq ur-container" id="robotics-faq"><div><p className="ur-eyebrow">COMMON QUESTIONS</p><h2>Questions,<br/>answered.</h2><a href="https://www.restorerobotics.com/mar-31--2026" target="_blank" rel="noreferrer">Restore’s clearance announcement ↗</a></div><div>{FAQS.map(([question,answer],i)=><details key={question}><summary><span>{String(i+1).padStart(2,'0')}</span>{question}<b aria-hidden="true">+</b></summary><p>{answer}</p></details>)}</div></section>

    <section className="ur-contact" id="robotics-lead"><div className="ur-container"><div className="ur-contact-heading"><p className="ur-eyebrow">YOUR NEXT STEP</p><h2>{kind==='collections'?<>Start your<br/>collection program.</>:kind==='distributor'?<>Build the program.<br/>With us.</>:<>There is more<br/>possibility ahead.</>}</h2></div><div className="ur-contact-grid"><div><p>{kind==='collections'?'Tell us about your facility. We’ll help arrange collection and return of expired robotic instruments.':kind==='distributor'?'Tell us about your company and the facilities you serve. Let’s discuss representing the program.':'Tell us about your facility. We’ll help you understand your options, pricing and next steps.'}</p><a href="tel:+18338686483">833.868.6483 ↗</a><a href="mailto:support@unitemedical.net">support@unitemedical.net ↗</a></div><LeadForm kind={kind} setKind={setKind}/></div></div></section>
    <div className="ur-disclaimer ur-container">da Vinci®, da Vinci Xi® and Intuitive® are registered trademarks of Intuitive Corporation. Restore Robotics is not affiliated with Intuitive®. Instrument eligibility, compatibility, availability and warranty terms are confirmed with each quote. Film based on Intuitive and Encore reference photography. Instrument photographs are shown for program context; availability is confirmed with each quote.</div>
  </main><Footer/></div>;
}
