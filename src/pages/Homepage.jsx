import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { UMLogo } from "../components/shared/Logo.jsx";
import { Icon } from "../components/shared/Icon.jsx";
import { HomepageFooter } from "../components/layout/HomepageFooter.jsx";
import { PartnerMarquee } from "../components/shared/PartnerMarquee.jsx";
import { CustomerSectors } from "../components/shared/CustomerSectors.jsx";
import { HomepageJourney } from "../components/shared/HomepageJourney.jsx";
import { auth } from "../lib/auth.js";
import { commerceAccessFor } from "../lib/accessPolicy.js";
import { useCart } from "../store/cart.js";
import { useSEO, organizationSchema, websiteSchema } from "../lib/seo.js";
import "./homepage.css";

gsap.registerPlugin(ScrollTrigger);
const MEDIA = "/media/homepage-film";
// Restore the previous homepage's roster. Text-only source assets are rendered
// as readable names instead of their cropped placeholder SVGs.
const HOME_PARTNERS = [
  {
    slug: "veterans-affairs",
    name: "U.S. Department of Veterans Affairs",
    displayName: "Veterans Affairs",
    wordmark: true,
  },
  { slug: "hca-healthcare", name: "HCA Healthcare", wordmark: true },
  { slug: "kaiser-permanente", name: "Kaiser Permanente", wordmark: true },
  { slug: "cvs-health", name: "CVS Health" },
  { slug: "walgreens", name: "Walgreens", wordmark: true },
  { slug: "publix", name: "Publix", wordmark: true },
  { slug: "amazon", name: "Amazon", width: "96px" },
  { slug: "gopuff", name: "goPuff", wordmark: true },
  { slug: "surgery-partners", name: "Surgery Partners" },
  { slug: "ascoa", name: "ASCOA", wordmark: true },
];
const NAV_LINKS = [
  ["/catalog", "Products"],
  ["/quote", "Source & Quote"],
  ["/regenicool", "RegeniCool Pro"],
  ["/services", "Services"],
  ["/government", "Government"],
  ["/about", "About"],
];
function accountPath(session) {
  if (!session) return "/login";
  if (session.role === "admin") return "/admin";
  if (["warehouse_manager", "warehouse_operator"].includes(session.role))
    return "/admin/inventory/receive";
  if (session.role === "distributor") return "/distributor";
  return session.role === "customer" ? "/dashboard" : "/work";
}
function HomepageNav() {
  const session = auth.use();
  const commerce = commerceAccessFor(session, auth.org());
  const cart = useCart();
  const cartCount = cart.items.reduce((count, item) => count + item.qty, 0);
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <header className="uf-header">
      <div className="uf-utility">
        <span>Veteran-owned. People-first.</span>
        <div>
          <a href="tel:+18338686483">833.868.6483</a>
          <Link to="/contact">Contact us</Link>
          <Link to={accountPath(session)}>
            {session ? "My account" : "Sign in"}{" "}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      <div className="uf-nav">
        <Link to="/" aria-label="Unite Medical home" className="uf-logo">
          <UMLogo size={38} color="#1d5c4d" />
        </Link>
        <nav className="uf-desktop-nav" aria-label="Primary">
          {NAV_LINKS.map(([to, label]) => (
            <Link key={to} to={to}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="uf-nav-actions">
          {commerce.can_use_cart ? (
            <Link
              className="uf-nav-quote"
              to="/cart"
              aria-label={`Cart, ${cartCount} items`}
            >
              <Icon.cart />
              <span>Cart{cartCount ? ` (${cartCount})` : ""}</span>
            </Link>
          ) : (
            <Link className="uf-nav-quote" to="/portal/quote">
              Quick quote <span aria-hidden="true">↗</span>
            </Link>
          )}
          <Link
            className="uf-search"
            to="/catalog"
            aria-label="Search products"
          >
            <Icon.search />
          </Link>
          <button
            ref={menuButton}
            className="uf-menu-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="homepage-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <Icon.close /> : <Icon.menu />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="homepage-menu"
          className="uf-mobile-nav"
          aria-label="Primary mobile"
        >
          {NAV_LINKS.map(([to, label]) => (
            <Link key={to} to={to} onClick={() => setOpen(false)}>
              {label}
              <Icon.arrow />
            </Link>
          ))}
          <Link to={accountPath(session)}>
            {session ? "My account" : "Sign in"}
            <Icon.arrow />
          </Link>
          <Link to="/portal/quote">
            Quick quote
            <Icon.arrow />
          </Link>
          <Link to="/contact">
            Contact us
            <Icon.arrow />
          </Link>
        </nav>
      )}
    </header>
  );
}
function Hero() {
  const videoRef = useRef(null);
  const heroRef = useRef(null);
  const progressRef = useRef(null);
  const playbackRef = useRef(() => {});
  const preferenceRef = useRef(null);
  const [paused, setPaused] = useState(true);
  useEffect(() => {
    const video = videoRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = navigator.connection;
    let inView = true;
    const syncPlayback = () => {
      const requested =
        preferenceRef.current ??
        !(reducedMotion.matches || connection?.saveData);
      if (requested && inView && !document.hidden) {
        if (!video.getAttribute("src"))
          video.src = `${MEDIA}/unite-hero-${window.matchMedia("(max-width: 760px)").matches ? "720" : "1080"}.mp4`;
        video.play().catch(() => {
          /* Keep the poster and play control if autoplay is blocked. */
        });
      } else video.pause();
    };
    playbackRef.current = syncPlayback;
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        syncPlayback();
      },
      { threshold: 0.08 },
    );
    observer.observe(heroRef.current);
    reducedMotion.addEventListener("change", syncPlayback);
    connection?.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    syncPlayback();
    return () => {
      observer.disconnect();
      video.pause();
      reducedMotion.removeEventListener("change", syncPlayback);
      connection?.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      playbackRef.current = () => {};
    };
  }, []);
  return (
    <section ref={heroRef} className="uf-hero" aria-labelledby="hero-title">
      <div className="uf-hero-window">
        <div className="uf-hero-media">
          <img
            className="uf-hero-poster"
            src={`${MEDIA}/hero-poster.webp`}
            width="1920"
            height="1080"
            alt=""
            fetchPriority="high"
          />
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onTimeUpdate={() => {
              const video = videoRef.current;
              if (progressRef.current)
                progressRef.current.style.transform = `scaleX(${video.duration ? video.currentTime / video.duration : 0})`;
            }}
          />
        </div>
      </div>
      <div className="uf-hero-shade" />
      <div className="uf-hero-content">
        <p className="uf-kicker uf-hero-in">
          Medical supplies · Sourcing · Private label
        </p>
        <h1 id="hero-title">
          <span>
            <span className="uf-hero-line">The supply chain </span>
          </span>
          <span>
            <span className="uf-hero-line">your suppliers </span>
          </span>
          <span>
            <span className="uf-hero-line">use.</span>
          </span>
        </h1>
        <p className="uf-hero-copy uf-hero-in">
          The products you need.
          <br />
          The people to help you find them.
        </p>
        <div className="uf-hero-ctas uf-hero-in">
          <Link className="uf-button uf-button-light" to="/quote">
            Tell us what you need
            <Icon.arrow />
          </Link>
          <Link className="uf-hero-browse" to="/catalog">
            Browse products <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      <div className="uf-hero-bottom">
        <a className="uf-explore" href="#how-we-help">
          Explore Unite <span aria-hidden="true">↓</span>
        </a>
        <div className="uf-film-controls">
          <div className="uf-film-progress" aria-hidden="true">
            <span ref={progressRef} />
          </div>
          <button
            className="uf-film-toggle"
            onClick={() => {
              preferenceRef.current = videoRef.current.paused;
              playbackRef.current();
            }}
            aria-label={
              paused ? "Play background video" : "Pause background video"
            }
          >
            {paused ? (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M6 4l10 6-10 6z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M6 4v12M14 4v12"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
const CAPABILITIES = [
  {
    id: "supplies",
    category: "Supply",
    title: ["Medical", "essentials."],
    image: "essentials",
    description:
      "The essentials behind your work, from exam gloves and diagnostics to bracing and recovery.",
    label: "Explore the catalog",
    to: "/catalog",
  },
  {
    id: "sourcing",
    category: "Source",
    title: ["Hard-to-find", "products"],
    image: "sourcing",
    description:
      "Tell us the product, quantity, and requirements. We’ll help you find a way forward.",
    label: "Source a product",
    to: "/quote?path=source",
  },
  {
    id: "private-label",
    category: "Private label",
    title: ["Your brand.", "Our experience."],
    image: "private-label",
    description:
      "Build a line of your own, with support from sourcing and packaging through fulfillment.",
    label: "Explore private label",
    to: "/services/private-label",
  },
];
function HomepageContent() {
  return (
    <>
      <section
        className="uf-intro uf-section"
        id="how-we-help"
        aria-labelledby="intro-heading"
      >
        <div className="uf-intro-copy" data-reveal>
          <div>
            <p className="uf-kicker">A partner on your side</p>
            <h2 id="intro-heading">
              Medical supplies for <br className="uf-desktop-break" /> the way
              you buy.
            </h2>
          </div>
          <p className="uf-intro-description">
            Find everyday products, solve a sourcing challenge, or develop your
            own product line. Start with the route that fits your business.
          </p>
        </div>
        <div className="uf-capabilities">
          {CAPABILITIES.map((item) => (
            <article className="uf-capability" key={item.to}>
              <Link
                className="uf-capability-link"
                to={item.to}
                aria-labelledby={`${item.id}-heading ${item.id}-action`}
                aria-describedby={`${item.id}-description`}
              >
                <div className="uf-capability-photo">
                  <img
                    src={`/media/capabilities/${item.image}-900.webp`}
                    srcSet={`/media/capabilities/${item.image}-600.webp 600w, /media/capabilities/${item.image}-900.webp 900w`}
                    sizes="(max-width: 900px) 90vw, 32vw"
                    alt=""
                    width="900"
                    height="1600"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="uf-capability-body">
                  <span className="uf-capability-category">
                    {item.category}
                  </span>
                  <h3 id={`${item.id}-heading`}>
                    {item.title.map((line, index) => (
                      <span key={line}>
                        {line}
                        {index === 0 ? " " : ""}
                      </span>
                    ))}
                  </h3>
                  <p id={`${item.id}-description`}>{item.description}</p>
                  <span
                    className="uf-capability-action"
                    id={`${item.id}-action`}
                  >
                    {item.label}
                    <span className="uf-capability-arrow" aria-hidden="true">
                      <Icon.arrow />
                    </span>
                  </span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </section>
      <CustomerSectors />
      <HomepageJourney />
    </>
  );
}
export function Homepage() {
  useSEO({
    title: "The supply chain your suppliers use",
    description:
      "Wholesale medical supplies, product sourcing, and private-label development for healthcare organizations, retailers, and medical suppliers. Tell Unite Medical what you need.",
    canonical: "/",
    type: "website",
    jsonLd: [organizationSchema(), websiteSchema()],
  });
  const rootRef = useRef(null);
  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        const entrance = gsap.timeline({ defaults: { ease: "power3.out" } });
        entrance.fromTo(
          ".uf-hero-window",
          { clipPath: "polygon(0% 0%, 8% 0%, 0% 100%, 0% 100%)" },
          {
            clipPath: "polygon(0% 0%, 112% 0%, 100% 100%, 0% 100%)",
            duration: 1.35,
            ease: "power3.inOut",
            clearProps: "clipPath",
          },
          0,
        );
        entrance.fromTo(
          ".uf-hero-media",
          { scale: 1.07 },
          { scale: 1, duration: 1.8 },
          0.1,
        );
        entrance.fromTo(
          ".uf-hero-line",
          { yPercent: 110 },
          {
            yPercent: 0,
            duration: 1.1,
            stagger: 0.1,
            ease: "power3.out",
          },
          0.3,
        );
        entrance.fromTo(
          ".uf-hero-in",
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            stagger: 0.1,
            ease: "power2.out",
          },
          0.5,
        );
        entrance.fromTo(
          ".uf-hero-bottom",
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.65 },
          0.9,
        );
        gsap.to(".uf-hero-media", {
          yPercent: 12,
          ease: "none",
          scrollTrigger: {
            trigger: ".uf-hero",
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
        gsap.to(".uf-hero-content", {
          y: -45,
          opacity: 0,
          ease: "none",
          scrollTrigger: {
            trigger: ".uf-hero",
            start: "35% top",
            end: "bottom top",
            scrub: true,
          },
        });
        rootRef.current.querySelectorAll("[data-reveal]").forEach((element) => {
          gsap.fromTo(
            element,
            { y: 28, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.85,
              ease: "power2.out",
              scrollTrigger: { trigger: element, start: "top 93%", once: true },
            },
          );
        });
      }, rootRef);
      return () => context.revert();
    });
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        gsap.fromTo(
          ".uf-recovery-device",
          { y: 75, scale: 0.93 },
          {
            y: -18,
            scale: 1,
            ease: "none",
            scrollTrigger: {
              trigger: ".uf-recovery-stage",
              start: "top bottom",
              end: "bottom 35%",
              scrub: 0.7,
              invalidateOnRefresh: true,
            },
          },
        );
        gsap.fromTo(
          ".uf-mission-landscape img",
          { yPercent: -5 },
          {
            yPercent: 5,
            ease: "none",
            scrollTrigger: {
              trigger: ".uf-mission",
              start: "top bottom",
              end: "bottom top",
              scrub: 0.7,
              invalidateOnRefresh: true,
            },
          },
        );
        rootRef.current.querySelectorAll(".uf-capability").forEach((card) => {
          gsap.fromTo(
            card.querySelector(".uf-capability-link"),
            { y: 120 },
            {
              y: 0,
              ease: "none",
              scrollTrigger: {
                trigger: card,
                start: "top bottom",
                end: "top 45%",
                scrub: 0.35,
                invalidateOnRefresh: true,
              },
            },
          );
          gsap.fromTo(
            card.querySelector(".uf-capability-photo"),
            { yPercent: 10 },
            {
              yPercent: -10,
              ease: "none",
              scrollTrigger: {
                trigger: card,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.6,
                invalidateOnRefresh: true,
              },
            },
          );
        });
      }, rootRef);
      return () => context.revert();
    });
    return () => media.revert();
  }, []);
  return (
    <div ref={rootRef} className="uf-home">
      <HomepageNav />
      <main id="main">
        <Hero />
        <PartnerMarquee items={HOME_PARTNERS} />
        <HomepageContent />
      </main>
      <HomepageFooter />
    </div>
  );
}
