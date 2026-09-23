import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./SupplyPartnership.css";

const MEDIA = "/media/supply-section";
const SERVICES = [
  ["Everyday medical supplies & essentials", "Catalog", "/catalog"],
  ["Sourcing for hard-to-find products", "Source", "/quote?path=source"],
  ["Private-label product development", "Develop", "/services/private-label"],
  ["Government & VA purchasing support", "Explore", "/government"],
];

function UniteMark() {
  return (
    <svg
      className="uf-supply-mark"
      viewBox="0 0 24 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3v9a5 5 0 0 0 10 0V3M13 17V9l4 5 4-5v8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SupplyPartnership() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const requestedRef = useRef(null);
  const playbackRef = useRef(() => {});
  const [paused, setPaused] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const small = window.matchMedia("(max-width: 820px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = navigator.connection;
    let inView = false;
    const sync = () => {
      const requested = requestedRef.current ?? !connection?.saveData;
      if (
        inView &&
        !document.hidden &&
        !small.matches &&
        !reduced.matches &&
        requested
      ) {
        if (!video.getAttribute("src"))
          video.src = `${MEDIA}/unite-partnership-1080.mp4`;
        video.play().catch(() => {});
      } else video.pause();
    };
    playbackRef.current = sync;
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        sync();
      },
      { threshold: 0.08 },
    );
    observer.observe(sectionRef.current);
    small.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    connection?.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      video.pause();
      small.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
      connection?.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      playbackRef.current = () => {};
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="unite-partnership"
      className="uf-supply"
      aria-labelledby="supply-heading"
    >
      <picture>
        <source
          media="(max-width: 820px)"
          srcSet={`${MEDIA}/partnership-mobile.webp`}
        />
        <img
          className="uf-supply-media"
          src={`${MEDIA}/partnership-poster.webp`}
          width="1920"
          height="1080"
          alt=""
          loading="lazy"
          decoding="async"
        />
      </picture>
      <video
        ref={videoRef}
        className={`uf-supply-media uf-supply-video${ready ? " is-ready" : ""}`}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        onPlaying={() => {
          setReady(true);
          setPaused(false);
        }}
        onPause={() => setPaused(true)}
        onError={() => setReady(false)}
      />
      <div className="uf-supply-masthead">
        <Link
          to="/about"
          className="uf-supply-brand"
          aria-label="About Unite Medical"
        >
          <UniteMark />
          <span>Unite Medical</span>
        </Link>
        <Link to="/quote" className="uf-supply-btn uf-supply-btn-dark">
          Start a quote
        </Link>
      </div>
      <div className="uf-supply-inner">
        <div className="uf-supply-copy">
          <h2 className="uf-supply-title" id="supply-heading">
            Everyday supplies. Hard-to-find products. Your own brand.
            <br />
            One partner for the way your business buys.
          </h2>
          <div className="uf-supply-actions">
            <Link to="/catalog" className="uf-supply-btn uf-supply-btn-cream">
              Find supplies
            </Link>
            <Link to="/contact" className="uf-supply-btn uf-supply-btn-glass">
              Talk to our team
            </Link>
          </div>
        </div>
        <div className="uf-supply-compare">
          <div className="uf-supply-panels" aria-hidden="true">
            <div className="uf-supply-panel-features" />
            <div className="uf-supply-panel-explore" />
          </div>
          <div className="uf-supply-brand-column" aria-hidden="true" />
          <div
            className="uf-supply-grid"
            role="table"
            aria-label="Ways Unite Medical supports your business"
          >
            <div className="uf-supply-head" role="row">
              <span className="uf-supply-h-feature" role="columnheader">
                How we help
              </span>
              <span className="uf-supply-h-unite" role="columnheader">
                <UniteMark />
                Unite
              </span>
              <span className="uf-supply-h-explore" role="columnheader">
                Explore
              </span>
            </div>
            {SERVICES.map(([label, action, to], index) => (
              <div
                className={`uf-supply-row${index === SERVICES.length - 1 ? " is-last" : ""}`}
                key={to}
                role="row"
              >
                <span className="uf-supply-row-label" role="rowheader">
                  {label}
                </span>
                <span className="uf-supply-row-unite" role="cell">
                  <svg
                    className="uf-supply-check"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-label="Supported by Unite"
                    role="img"
                  >
                    <path
                      d="M2.4 7.4l3 3 6.2-7"
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="uf-supply-row-explore" role="cell">
                  <Link to={to} aria-label={`${action}: ${label}`}>
                    {action}
                    <span aria-hidden="true"> ↗</span>
                  </Link>
                </span>
              </div>
            ))}
          </div>
          <div className="uf-supply-totals">
            <span>Ready when you are.</span>
            <Link to="/quote">Let’s talk</Link>
            <a
              href="tel:+18338686483"
              aria-label="Call Unite Medical at 833.868.6483"
            >
              Call <span aria-hidden="true">↗</span>
            </a>
          </div>
          <p className="uf-supply-footnote">
            Tell us what you need. We’ll help you choose the right path.
          </p>
        </div>
      </div>
      <button
        className="uf-supply-motion"
        type="button"
        aria-label={
          paused ? "Play partnership video" : "Pause partnership video"
        }
        onClick={() => {
          requestedRef.current = videoRef.current.paused;
          playbackRef.current();
        }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          {paused ? (
            <path d="M6 4l10 6-10 6z" fill="currentColor" />
          ) : (
            <path d="M7 5v10m6-10v10" stroke="currentColor" strokeWidth="1.6" />
          )}
        </svg>
        <span>{paused ? "Play film" : "Pause film"}</span>
      </button>
    </section>
  );
}
