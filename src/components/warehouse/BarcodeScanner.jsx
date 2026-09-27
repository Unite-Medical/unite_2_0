import { useEffect, useRef, useState } from 'react';
import { WorkspaceIcon } from '../workspace/WorkspaceIcon.jsx';

export function BarcodeScanner({ target, onRead, onClose }) {
  const video = useRef(null), dialog = useRef(null), controls = useRef(null);
  const read = useRef(onRead);
  const [error, setError] = useState(''), [ready, setReady] = useState(false);
  useEffect(() => { read.current = onRead; }, [onRead]);
  useEffect(() => {
    const modal = dialog.current;
    const previous = document.activeElement;
    modal.showModal();
    let cancelled = false, found = false, stream;
    const stop = () => { controls.current?.stop(); stream?.getTracks().forEach(t=>t.stop()); };
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera scanning needs a secure browser connection. Use Safari on the staging site or enter the barcode.');
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({ audio:false, video:{facingMode:{ideal:'environment'}, width:{ideal:1920}, height:{ideal:1080}} });
        if (cancelled) { stop(); return; }
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts:250, delayBetweenScanSuccess:1000 });
        controls.current = await reader.decodeFromStream(stream, video.current, (result, _error, control) => {
          if (!result || cancelled || found) return;
          found = true; control.stop(); stop(); read.current(result.getText());
        });
        if (cancelled || found) { stop(); return; }
        setReady(true);
      } catch (e) {
        stop();
        if (!cancelled) setError(e.name === 'NotAllowedError' ? 'Camera access was denied. Allow camera access in Safari’s website settings, or use a Bluetooth scanner / type the label.' : e.name === 'NotFoundError' ? 'No camera found. Use a Bluetooth scanner or type the label.' : e.message || 'Camera unavailable. Enter the label instead.');
      }
    }
    start();
    const hide = () => { if (document.hidden) onClose(); };
    document.addEventListener('visibilitychange', hide);
    return () => { cancelled = true; stop(); modal.close(); previous?.focus(); document.removeEventListener('visibilitychange', hide); };
  }, [onClose]);
  return <dialog ref={dialog} className="wm-camera" onCancel={onClose} aria-labelledby="camera-title">
    <header><div><p>CAMERA SCANNER</p><h2 id="camera-title">{target === 'location' ? 'Scan a location label' : 'Scan a product or pallet'}</h2></div><button onClick={onClose} aria-label="Close scanner"><WorkspaceIcon name="close"/></button></header>
    <div className="wm-camera-view"><video ref={video} autoPlay muted playsInline/><div className="wm-camera-guide" aria-hidden="true"/><span>{ready ? 'Hold the label steady inside the frame' : 'Starting camera…'}</span></div>
    {error ? <p role="alert">{error}</p> : <p role="status">Reads UPC, EAN, Code 128, GS1, QR and Data Matrix. A scan identifies the label; you enter the physical quantity.</p>}
    <button onClick={onClose}>Close · use keyboard or scanner</button>
  </dialog>;
}
