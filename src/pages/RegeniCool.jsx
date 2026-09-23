import { useRef, useState } from 'react';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { useSEO } from '../lib/seo.js';
import './regenicool.css';

const configurations = [
  ['Device + carry bag', 'RegeniCool Pro unit, connector hose, power adapter, carry bag with shoulder strap, drain accessory and user manual. Wrap sold separately.'],
  ['360° knee bundle', 'The device and carry-bag contents, plus a 360° knee wrap with adjustable straps.'],
  ['Hip bundle', 'The device and carry-bag contents, plus a hip wrap.'],
];
export function RegeniCool() {
  useSEO({ title: 'RegeniCool Pro', description: 'Explore the RegeniCool Pro ice-water circulation system, knee and hip configurations, and compatible wraps. Request dealer information from Unite Medical.', canonical: '/regenicool' });
  const key = useRef(null);
  const [state, setState] = useState({ busy: false, error: '', receipt: null });
  async function submit(event) {
    event.preventDefault();
    if (state.busy) return;
    key.current ||= crypto.randomUUID();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setState({ busy: true, error: '', receipt: null });
    try {
      const response = await fetch('/api/public/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, kind: 'regenicool', idempotency_key: key.current }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(response.status === 429 ? 'Please try again later. Too many requests were received.' : 'We could not save your request. Please try again or contact support@unitemedical.net.');
      setState({ busy: false, error: '', receipt: result.id });
    } catch (error) { setState({ busy: false, error: error.message || 'Connection interrupted. Please try again.', receipt: null }); }
  }
  return <><Nav /><main id="main" className="rc-page">
    <section className="rc-hero rc-container">
      <div><p className="rc-eyebrow">UNITE MEDICAL · DEALER INQUIRIES</p><h1>RegeniCool <span>Pro.</span></h1><p className="rc-lead">Explore an ice-water circulation system with knee and hip configurations and additional compatible wrap options.</p><p>Contact Unite Medical to learn about carrying RegeniCool Pro.</p><a className="rc-button" href="#dealer-information">Request Dealer Information</a><p className="rc-caption">Provider-directed use. Ice and water required.</p></div>
      <figure className="rc-product"><img src="/images/regenicool/red-device.png" alt="Red Unite RegeniCool Pro circulation unit" width="1620" height="1620" fetchPriority="high" /><figcaption>RegeniCool Pro · Red Unite model</figcaption></figure>
    </section>
    <section className="rc-band"><div className="rc-container rc-facts"><div><h2>Ice-water circulation</h2><p>Circulates water from an ice-and-water reservoir through the connected wrap.</p></div><div><h2>Water-based pressure</h2><p>Circulation creates water-based pressure. It does not use pneumatic air compression.</p></div><div><h2>Provider-directed use</h2><p>Follow your healthcare provider’s directions and the supplied instructions for use.</p></div></div></section>
    <section className="rc-container rc-section rc-configurations"><div><p className="rc-eyebrow">THE CONFIGURATIONS</p><h2>One system.<br />A choice of wraps.</h2><p>Start with the device and carry bag, or choose a knee or hip bundle.</p>{configurations.map(([title, copy], i) => <article className="rc-configuration" key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div><img src="/images/regenicool/configurations.png" alt="Red Unite RegeniCool Pro shown with carry bag, 360 degree knee wrap and hip wrap" loading="lazy" width="1620" height="1620" /></section>
    <section className="rc-container rc-section rc-wraps"><img src="/images/regenicool/wraps.png" alt="Compatible shoulder, back, knee, ankle, hip, 360 degree knee, leg, universal and full leg wraps" loading="lazy" width="1620" height="1620" /><div><p className="rc-eyebrow">COMPATIBLE WRAP OPTIONS</p><h2>Explore the fit<br />for your customers.</h2><p>Ask about shoulder, back, knee, ankle, hip, 360° knee, leg, full-leg and universal wraps. Confirm configuration, sizing and availability with Unite.</p><p>Wrap selection and use should follow the treating provider’s directions.</p><a href="#dealer-information" className="rc-text-link">Discuss your product range →</a></div></section>
    <section className="rc-container rc-retail"><div><p className="rc-eyebrow">RETAIL TRANSPARENCY</p><h2>See the current retail offer.</h2><p>Explore the TJS retail collection. We’ll review MSRP and the current TJS offer with prospective dealers before commitment.</p></div><a className="rc-button rc-secondary" href="https://tjs.unitemedical.net/store/regenicool" target="_blank" rel="noreferrer">View TJS retail collection ↗</a></section>
    <section id="dealer-information" className="rc-container rc-section rc-inquiry"><div><p className="rc-eyebrow">LET’S TALK</p><h2>Carry RegeniCool Pro.</h2><p>Tell us about your business and the configurations you’re interested in. Jacobe handles dealer inquiries for Unite Medical.</p><p className="rc-caption">This is an information request. Dealer pricing and program terms are discussed individually.</p></div>
      {state.receipt ? <div className="rc-confirmation" role="status"><h3>Thank you. Your request is saved.</h3><p>Your inquiry is in Unite’s dealer review queue for Jacobe.</p><p className="rc-caption">Reference: {state.receipt}</p></div> : <form onSubmit={submit} className="rc-form"><div className="rc-form-grid">{[['name','Name','text',true],['company','Company','text',true],['email','Email','email',true],['phone','Phone (optional)','tel',false]].map(([name,label,type,required]) => <label key={name}>{label}<input name={name} type={type} required={required} maxLength={200} autoComplete={name === 'company' ? 'organization' : name === 'phone' ? 'tel' : name} /></label>)}</div><label>Business type<select name="business_type" required defaultValue=""><option value="" disabled>Select your business type</option>{['Medical supply dealer','Distributor','Clinic or healthcare provider','Pharmacy','Other business'].map(v=><option key={v}>{v}</option>)}</select></label><label>Message<textarea name="message" rows="4" maxLength={4000} placeholder="Tell us about your business and product interests." /></label><input className="rc-honeypot" name="website_confirm" tabIndex="-1" autoComplete="off" aria-hidden="true" />{state.error && <p role="alert" className="rc-error">{state.error}</p>}<button className="rc-button" disabled={state.busy}>{state.busy ? 'Saving your request…' : 'Request Dealer Information'}</button></form>}
    </section>
  </main><Footer /></>;
}
