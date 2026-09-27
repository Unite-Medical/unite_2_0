import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UMLogo } from "../shared/Logo.jsx";
import "./HomepageFooter.css";

const MEDIA = "/media/footer";
const COLUMNS = [
  {
    title: "Explore",
    links: [
      ["/catalog", "Products"],
      ["/quote", "Source & quote"],
      ["/services/private-label", "Private label"],
    ],
  },
  {
    title: "Unite",
    links: [
      ["/about", "About us"],
      ["/support", "Support"],
      ["/contact", "Contact"],
    ],
  },
];

function ContactIcon({ type }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === "mail" && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <path d="m3 6 9 7 9-7" />
        </>
      )}
      {type === "phone" && (
        <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a15 15 0 0 1-7-7l2-2-2-5Z" />
      )}
    </svg>
  );
}

export function HomepageFooter() {
  const footerRef = useRef(null);
  const videoRef = useRef(null);
  const mediaRef = useRef(null);
  const requestedRef = useRef(null);
  const syncRef = useRef(() => {});
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    const footer = footerRef.current;
    const video = videoRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = navigator.connection;
    let visible = false;
    const sync = () => {
      const requested = requestedRef.current ?? !connection?.saveData;
      if (visible && !document.hidden && !reduced.matches && requested) {
        if (!video.getAttribute("src"))
          video.src = `${MEDIA}/unite-footer-original-${window.matchMedia("(max-width: 1100px)").matches ? "720" : "1080"}.mp4`;
        video.play().catch(() => {});
      } else video.pause();
    };
    syncRef.current = sync;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === footer && entry.isIntersecting)
            footer.dataset.entered = "true";
          if (entry.target === mediaRef.current) visible = entry.isIntersecting;
        });
        sync();
      },
      { threshold: 0.02 },
    );
    observer.observe(footer);
    observer.observe(mediaRef.current);
    reduced.addEventListener("change", sync);
    connection?.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      video.pause();
      reduced.removeEventListener("change", sync);
      connection?.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      syncRef.current = () => {};
    };
  }, []);

  return (
    <footer
      id="unite-footer"
      ref={footerRef}
      className="um-art-footer"
      aria-label="Unite Medical footer"
    >
      <div className="um-art-inner">
        <div className="um-art-grid">
          <div className="um-art-brand">
            <Link
              className="um-art-lockup um-art-rise"
              to="/"
              aria-label="Unite Medical home"
              style={{ "--rise-delay": ".04s" }}
            >
              <UMLogo size={48} />
            </Link>
            <p
              className="um-art-blurb um-art-rise"
              style={{ "--rise-delay": ".12s" }}
            >
              Veteran-owned medical supplies, sourcing, and private label.
            </p>
            <ul className="um-art-contacts">
              <li className="um-art-rise" style={{ "--rise-delay": ".2s" }}>
                <ContactIcon type="mail" />
                <a href="mailto:support@unitemedical.net">
                  support@unitemedical.net
                </a>
              </li>
              <li className="um-art-rise" style={{ "--rise-delay": ".28s" }}>
                <ContactIcon type="phone" />
                <a href="tel:+18338686483">833.868.6483</a>
              </li>
            </ul>
          </div>
          {COLUMNS.map((column, colIndex) => (
            <nav
              className="um-art-col"
              aria-label={`Footer ${column.title}`}
              key={column.title}
            >
              <h2
                className="um-art-title um-art-rise"
                style={{ "--rise-delay": `${0.16 + colIndex * 0.08}s` }}
              >
                {column.title}
              </h2>
              <ul className="um-art-links">
                {column.links.map(([to, label], index) => (
                  <li
                    key={to}
                    className="um-art-rise"
                    style={{
                      "--rise-delay": `${0.24 + colIndex * 0.08 + index * 0.08}s`,
                    }}
                  >
                    <Link to={to}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="um-art-bottom">
          <p className="um-art-copyright">
            © {new Date().getFullYear()} Unite Medical Supply
            <span>1487 Trae Lane · Lithia Springs, GA 30122</span>
          </p>
          <nav className="um-art-legal" aria-label="Footer legal">
            <Link
              to="/privacy"
              className="um-art-rise"
              style={{ "--rise-delay": ".7s" }}
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="um-art-rise"
              style={{ "--rise-delay": ".78s" }}
            >
              Terms
            </Link>
            <Link
              to="/compliance#docs"
              className="um-art-rise"
              style={{ "--rise-delay": ".86s" }}
            >
              Compliance
            </Link>
          </nav>
          <button
            className="um-art-motion"
            type="button"
            aria-label={
              paused ? "Play footer illustration" : "Pause footer illustration"
            }
            onClick={() => {
              requestedRef.current = videoRef.current.paused;
              syncRef.current();
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              {paused ? (
                <path d="M6 4l10 6-10 6z" fill="currentColor" />
              ) : (
                <path
                  d="M7 5v10m6-10v10"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              )}
            </svg>
            {paused ? "Play motion" : "Pause motion"}
          </button>
        </div>
      </div>
      <div ref={mediaRef} className="um-art-media" aria-hidden="true">
        <img
          className="um-art-poster"
          src={`${MEDIA}/unite-footer-original-poster.webp`}
          alt=""
          width="1920"
          height="1080"
          loading="lazy"
          decoding="async"
        />
        <video
          ref={videoRef}
          className="um-art-film"
          muted
          loop
          playsInline
          preload="none"
          poster={`${MEDIA}/unite-footer-original-poster.webp`}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        />
      </div>
    </footer>
  );
}
