import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon.jsx";
import "./CustomerSectors.css";

const SECTORS = [
  {
    id: "pharmacy",
    name: "Pharmacies & retail",
    focus: "Your shelves. Your community.",
    title: "More ways to serve the people who count on you.",
    description:
      "Diagnostics, PPE, bracing, and everyday medical products to support your front-of-store assortment.",
    action: "Explore pharmacy supply",
    to: "/segments/pharmacy",
    image: "/media/homepage-film/scene-3.webp",
    position: "58% 35%",
  },
  {
    id: "health",
    name: "Health systems & practices",
    focus: "Everyday needs. Complex requests.",
    title: "Keep your team focused on the people in your care.",
    description:
      "From routine supplies to hard-to-find items, share your shortage list and let our team review sourcing options.",
    action: "Get help with a shortage list",
    to: "/shortage-list",
    image: "/media/homepage-film/scene-4.webp",
    position: "62% 32%",
  },
  {
    id: "distribution",
    name: "Distributors & resellers",
    focus: "A partner behind your business",
    title: "Your customers. Our supply and fulfillment support.",
    description:
      "Expand your offering with wholesale products, sourcing, warehousing, and blind-shipping options.",
    action: "Explore distributor support",
    to: "/segments/distributors",
    image: "/images/generated/DIST-01-v1.webp",
    position: "50% 38%",
  },
  {
    id: "government",
    name: "Government & VA",
    focus: "Veteran-owned. Mission-minded.",
    title: "A supply partner that understands your mission.",
    description:
      "Explore Unite’s government purchasing information, business credentials, and MSPV BPA details.",
    action: "Explore government purchasing",
    to: "/government",
    image: "/media/homepage-film/scene-2.webp",
    position: "57% 35%",
  },
];

export function CustomerSectors() {
  const [active, setActive] = useState(0);
  const tabsRef = useRef([]);
  const swipeRef = useRef(null);
  const sector = SECTORS[active];

  function handleKeyDown(event, index) {
    let next;
    if (["ArrowDown", "ArrowRight"].includes(event.key))
      next = (index + 1) % SECTORS.length;
    else if (["ArrowUp", "ArrowLeft"].includes(event.key))
      next = (index - 1 + SECTORS.length) % SECTORS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = SECTORS.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabsRef.current[next]?.focus();
  }

  return (
    <section
      className="uf-sectors"
      id="who-we-serve"
      aria-labelledby="people-heading"
    >
      <header className="uf-sectors-heading" data-reveal>
        <p className="uf-kicker">Who we serve</p>
        <h2 id="people-heading">
          Different settings.
          <br />
          One committed partner.
        </h2>
        <p className="uf-sectors-intro">
          Your needs are specific to the work you do. Find the products,
          sourcing, and support that fit your world.
        </p>
      </header>
      <div
        className="uf-sectors-tabs"
        role="tablist"
        aria-label="Customer settings"
      >
        {SECTORS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabsRef.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`sector-tab-${item.id}`}
            aria-selected={active === index}
            aria-controls="sector-detail"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div
        id="sector-detail"
        className="uf-sector-panel"
        role="tabpanel"
        aria-labelledby={`sector-tab-${sector.id}`}
        tabIndex={0}
      >
        <div
          className="uf-sector-viewport"
          onPointerDown={(event) => {
            if (event.pointerType === "touch")
              swipeRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerCancel={() => {
            swipeRef.current = null;
          }}
          onPointerUp={(event) => {
            const start = swipeRef.current;
            swipeRef.current = null;
            if (!start) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3)
              setActive((current) =>
                Math.max(
                  0,
                  Math.min(SECTORS.length - 1, current + (dx < 0 ? 1 : -1)),
                ),
              );
          }}
        >
          <div className="uf-sector-track" style={{ "--sector-index": active }}>
            {SECTORS.map((item, index) => (
              <div
                className={`uf-sector-slide ${index === active ? "is-active" : ""}`}
                key={item.id}
                aria-hidden="true"
              >
                <img
                  src={item.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width="1440"
                  height="810"
                  style={{ objectPosition: item.position }}
                />
                <div className="uf-sector-image-shade" />
                <span className="uf-sector-image-label">{item.name}</span>
                <span className="uf-sector-image-count">
                  {String(index + 1).padStart(2, "0")} / 04
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="uf-sector-caption" key={sector.id}>
          <h3>{sector.title}</h3>
          <p>{sector.description}</p>
          <Link className="uf-sector-action" to={sector.to}>
            {sector.action}
            <Icon.arrow />
          </Link>
        </div>
      </div>
      <div
        className="uf-sector-navigation"
        aria-label="Browse customer settings"
      >
        <button
          type="button"
          aria-label="Previous customer setting"
          disabled={active === 0}
          onClick={() => setActive((current) => Math.max(0, current - 1))}
        >
          <Icon.arrow />
        </button>
        <span aria-live="polite" aria-atomic="true">
          {String(active + 1).padStart(2, "0")}{" "}
          <span aria-hidden="true">—</span>{" "}
          {String(SECTORS.length).padStart(2, "0")}
        </span>
        <button
          type="button"
          aria-label="Next customer setting"
          disabled={active === SECTORS.length - 1}
          onClick={() =>
            setActive((current) => Math.min(SECTORS.length - 1, current + 1))
          }
        >
          <Icon.arrow />
        </button>
      </div>
    </section>
  );
}
