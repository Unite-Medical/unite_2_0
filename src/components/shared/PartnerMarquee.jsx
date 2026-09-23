import { useEffect, useId, useRef, useState } from "react";
import { D } from "../../tokens.js";
import "./PartnerMarquee.css";

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_PARTNER_LOGOS = [
  { slug: "restore-robotics", name: "Restore Robotics" },
  { slug: "gopuff", name: "goPuff" },
  { slug: "veterans-affairs", name: "U.S. Department of Veterans Affairs" },
  { slug: "publix", name: "Publix" },
  { slug: "henry-ford-hospital", name: "Henry Ford Hospital" },
  { slug: "ardent-health", name: "Ardent Health" },
  { slug: "harps-food", name: "Harps Food Stores" },
  { slug: "uf-health", name: "UF Health" },
  { slug: "orlando-health", name: "Orlando Health" },
  { slug: "total-joint-specialists", name: "Total Joint Specialists" },
];

function PartnerLogo({ item, variant }) {
  const [fallback, setFallback] = useState(0);
  if (item.wordmark || fallback === 2) {
    return (
      <span className="um-partner-wordmark">
        {item.displayName || item.name}
      </span>
    );
  }
  return (
    <img
      className="um-partner-logo"
      src={
        fallback === 1
          ? `/logos/partners/raster-fallback/${item.slug}--${variant}.png`
          : `/logos/partners/processed/${item.slug}--${variant}.svg`
      }
      alt={item.name}
      width="176"
      height="48"
      loading="lazy"
      decoding="async"
      style={{ "--mark-width": item.width || "176px" }}
      onError={() => setFallback((value) => Math.min(value + 1, 2))}
    />
  );
}

export function PartnerMarquee({
  items = DEFAULT_PARTNER_LOGOS,
  background = D.paper,
  borderColor = D.line,
  eyebrow = "Partners and customers",
  reverse = false,
  speed = "normal",
  showEyebrow = true,
  variant = "ink",
  eyebrowColor = D.ink2,
}) {
  const labelId = useId();
  const sectionRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let inView = false;
    const sync = () => setActive(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(sectionRef.current);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="um-partners"
      aria-label={showEyebrow ? undefined : "Partners and customers"}
      aria-labelledby={showEyebrow ? labelId : undefined}
      data-paused={paused || !active}
      data-variant={variant}
      style={{
        "--partner-background": background,
        "--partner-border": borderColor,
        "--partner-color": variant === "paper" ? D.paper : D.ink,
        "--partner-label": eyebrowColor,
        "--partner-speed": speed === "slow" ? "70s" : "52s",
        "--partner-direction": reverse ? "reverse" : "normal",
      }}
    >
      <div className="um-partners-heading">
        {showEyebrow && <p id={labelId}>{eyebrow}</p>}
        <button
          type="button"
          className="um-partners-toggle"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? "Play scrolling logos" : "Pause scrolling logos"}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            {paused ? (
              <path d="M6 4l10 6-10 6z" fill="currentColor" />
            ) : (
              <path
                d="M7 5v10m6-10v10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            )}
          </svg>
          <span>{paused ? "Play" : "Pause"}</span>
        </button>
      </div>
      <div className="um-partners-viewport">
        <div className="um-partners-track">
          {[0, 1].map((copy) => (
            <ul
              className="um-partners-group"
              key={copy}
              aria-hidden={copy === 1 ? true : undefined}
              role="list"
            >
              {items.map((item) => (
                <li className="um-partner-slot" key={item.slug}>
                  <PartnerLogo item={item} variant={variant} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
