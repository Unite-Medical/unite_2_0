import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./HomepageRobotics.css";

export function HomepageRobotics() {
  const frame = useRef(null);
  const film = useRef(null);
  const preference = useRef(null);
  const sync = useRef(() => {});
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = film.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = matchMedia("(max-width: 600px)");
    const connection = navigator.connection;
    let visible = false;
    const update = () => {
      const requested = preference.current ?? !(reduced.matches || mobile.matches || connection?.saveData);
      if (visible && requested && !document.hidden) {
        if (!video.getAttribute("src")) video.src = "/images/robotics/robotics-hero-short.mp4";
        video.play().catch(() => {});
      } else video.pause();
    };
    sync.current = update;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    }, { threshold: 0.12 });
    observer.observe(frame.current);
    reduced.addEventListener("change", update);
    mobile.addEventListener("change", update);
    connection?.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      video.pause();
      reduced.removeEventListener("change", update);
      mobile.removeEventListener("change", update);
      connection?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      sync.current = () => {};
    };
  }, []);

  return (
    <section ref={frame} className="uf-robotics-feature" aria-labelledby="home-robotics-heading">
      <div className="uf-robotics-media" aria-hidden="true">
        <img src="/images/mobile-v1/robotics-system.webp" alt="" width="1728" height="1117" loading="lazy" decoding="async" />
        <video ref={film} hidden={failed} muted loop playsInline preload="none"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onError={() => { setFailed(true); setPlaying(false); }} />
      </div>
      <div className="uf-robotics-topline"><span>Unite Medical / Restore Robotics</span><span>A new life for precision</span></div>
      <div className="uf-robotics-editorial">
        <p className="uf-robotics-eyebrow">The Restore Robotics program</p>
        <h2 id="home-robotics-heading">More life from<br />every instrument.</h2>
        <p className="uf-robotics-description">Instrument supply. Collections. Savings.<br />A connected program for your facility.</p>
        <Link className="uf-robotics-explore" to="/robotics">Explore Restore Robotics <span aria-hidden="true">↗</span></Link>
      </div>
      <div className="uf-robotics-bottomline">
        <span>Remanufactured &amp; certified pre-owned instruments</span>
        <div>
          {!failed && <button type="button" className="uf-robotics-film-toggle"
            aria-label={playing ? "Pause Restore Robotics film" : "Play Restore Robotics film"}
            onClick={() => { preference.current = film.current.paused; sync.current(); }}>
            <span aria-hidden="true">{playing ? "Ⅱ" : "▷"}</span>{playing ? "Pause" : "Play"}
          </button>}
        </div>
      </div>
    </section>
  );
}
