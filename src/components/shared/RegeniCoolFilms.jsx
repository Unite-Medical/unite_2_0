import { useEffect, useRef, useState } from 'react';
import './RegeniCoolFilms.css';

const MEDIA = '/media/regenicool/video';

export function RegeniCoolFilms() {
  const section = useRef(null), film = useRef(null), sync = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(() => {
    try { return localStorage.getItem('unite-regenicool-motion') === 'enabled'; } catch { return false; }
  });
  const [staticMode, setStaticMode] = useState(false);
  const [playbackMode, setPlaybackMode] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = navigator.connection;
    let observer, raf = 0, allowed = false, progress = null, previous = 0;
    const update = now => {
      raf = 0;
      if (!allowed || !section.current || document.hidden) return;
      const bounds = section.current.getBoundingClientRect();
      const target = Math.min(1, Math.max(0, -bounds.top / Math.max(1, bounds.height - window.innerHeight)));
      const elapsed = previous ? Math.min(64, now - previous) : 16;
      previous = now;
      progress = progress === null ? target : progress + (target - progress) * (1 - Math.exp(-elapsed / 140));
      const settling = Math.abs(target - progress) > .00015;
      if (!settling) progress = target;
      section.current.style.setProperty('--rc-film-progress', progress);
      const video = film.current;
      if (video?.readyState >= 2 && Number.isFinite(video.duration) && !video.seeking) {
        const time = progress * Math.max(0, video.duration - .05);
        if (Math.abs(video.currentTime - time) > .025) video.currentTime = time;
      }
      if (settling) raf = requestAnimationFrame(update);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    sync.current = schedule;
    const configure = () => {
      observer?.disconnect();
      allowed = !playbackMode && (motionEnabled || (!reduced.matches && !connection?.saveData));
      setStaticMode(!allowed);
      if (!allowed) {
        cancelAnimationFrame(raf); raf = 0; progress = null; previous = 0;
        setLoaded(true);
        return;
      }
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { setLoaded(true); schedule(); }
      }, { rootMargin: '400px 0px' });
      observer.observe(section.current);
      schedule();
    };
    configure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', schedule);
    reduced.addEventListener('change', configure);
    connection?.addEventListener('change', configure);
    return () => {
      observer?.disconnect(); cancelAnimationFrame(raf); sync.current = null;
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', schedule);
      reduced.removeEventListener('change', configure); connection?.removeEventListener('change', configure);
    };
  }, [motionEnabled, playbackMode]);
  return (
    <div ref={section} id="regenicool-orbit" className={`uf-regen-orbit${staticMode || failed ? ' is-static' : ''}`} aria-label="Explore the RegeniCool Pro unit">
      <div className="uf-regen-orbit-sticky">
        <div className="uf-regen-film-top"><span>{failed ? 'THE SYSTEM, UP CLOSE' : staticMode ? 'PRESS PLAY TO EXPLORE' : 'SCROLL TO ROTATE ↓'}</span><span className="uf-regen-film-actions">{!staticMode && !failed && <button type="button" onClick={() => {
          setPlaybackMode(true);
          requestAnimationFrame(() => section.current?.scrollIntoView({ block: "start", behavior: "instant" }));
        }}>Watch video ▷</button>}<a href="#regenicool-details">Explore the details ↓</a></span></div>
        <div className="uf-regen-orbit-media">
          <img src={`${MEDIA}/product-orbit-isolated-poster.jpg`} width="1920" height="1080" alt="RegeniCool™ Pro red circulation unit, isolated against the page background" loading="lazy" />
          {loaded && !failed && <video ref={film} src={`${MEDIA}/product-orbit-isolated.mp4`} poster={`${MEDIA}/product-orbit-isolated-poster.jpg`} muted playsInline controls={staticMode} preload={staticMode ? "none" : "auto"} aria-hidden={staticMode ? undefined : true} aria-label={staticMode ? "RegeniCool Pro product video" : undefined} onLoadedData={() => sync.current?.()} onSeeked={() => sync.current?.()} onError={() => setFailed(true)} />}
        </div>
        {staticMode && !failed && <button type="button" className="uf-regen-enable-motion" onClick={() => {
          try { localStorage.setItem('unite-regenicool-motion', 'enabled'); } catch { /* Storage is optional. */ }
          film.current?.pause();
          setPlaybackMode(false);
          setMotionEnabled(true);
        }}>Enable scroll rotation <span aria-hidden="true">↕</span></button>}
        {failed && <a className="uf-regen-enable-motion" href={`${MEDIA}/product-orbit-isolated.mp4`}>Watch the product video ↗</a>}
        {!staticMode && !failed && <div className="uf-regen-orbit-track" aria-hidden="true"><span /></div>}
      </div>
    </div>
  );
}
