import { useEffect, useId, useRef, useState } from "react";
import { PARTNER_LOGOS } from "../../data/partnerLogos.js";
import { D } from "../../tokens.js";
import "./PartnerMarquee.css";

function PartnerLogo({ item }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="um-partner-wordmark">{item.name}</span>;
  return <img className="um-partner-logo" data-tone={item.tone || 'solid'}
    src={item.src} alt={item.name} width="200" height="60"
    loading="lazy" decoding="async"
    style={{ '--mark-width': item.width, '--mark-height': item.height }}
    onError={() => setFailed(true)} />;
}

export function PartnerMarquee({
  items = PARTNER_LOGOS,
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
        "--partner-speed": `${items.length * (speed === "slow" ? 6 : 4.5)}s`,
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
                  <PartnerLogo item={item} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
