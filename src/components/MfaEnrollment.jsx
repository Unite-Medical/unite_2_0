import {useEffect,useRef,useState} from 'react';
import {mfaEnrollmentUri} from '../lib/mfaEnrollment.js';

export function MfaEnrollment({enrollment}) {
  const qr=useRef(null);
  const [qrState,setQrState]=useState({status:'loading'});
  const [manual,setManual]=useState(false);
  const {setup_key,issuer,account}=enrollment;
  useEffect(()=>{
    let active=true;
    const container=qr.current;
    import('@zxing/browser').then(({BrowserQRCodeSvgWriter})=>{
      const uri=mfaEnrollmentUri({setup_key,issuer,account});
      const svg=new BrowserQRCodeSvgWriter().write(uri,256,256);
      svg.setAttribute('role','img');
      svg.setAttribute('aria-label','Authenticator enrollment QR code');
      svg.setAttribute('shape-rendering','crispEdges');
      if(active){container.replaceChildren(svg);setQrState({status:'ready'});}
    }).catch(()=>{if(active)setQrState({status:'error'});});
    return()=>{active=false;container.replaceChildren();};
  },[setup_key,issuer,account]);
  return <div className="um-enrollment um-enrollment-qr">
    <p>Scan this QR code with your authenticator, then enter its six-digit code below.</p>
    <p className="um-enrollment-account"><strong>Account</strong><span>{account}</span></p>
    <div className="um-enrollment-qr-image" ref={qr}/>
    {qrState.status==='loading'&&<p role="status">Preparing QR code…</p>}
    {qrState.status==='error'&&<p role="alert">The QR code could not load. Use the manual setup option or sign in again.</p>}
    <button type="button" className="um-enrollment-manual-toggle" aria-expanded={manual} aria-controls="mfa-manual-setup" onClick={()=>setManual(value=>!value)}>{manual?'Hide manual setup':'Can’t scan?'}</button>
    <div id="mfa-manual-setup" hidden={!manual}>{manual&&<><p>Add a time-based account in your authenticator using this key. Keep the key private.</p><label>Setup key<input readOnly autoComplete="off" spellCheck={false} value={setup_key} onFocus={event=>event.target.select()}/></label></>}</div>
  </div>;
}
