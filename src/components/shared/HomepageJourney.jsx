import { Link } from "react-router-dom";
import { Icon } from "./Icon.jsx";
import "./HomepageJourney.css";

export function HomepageJourney() {
  return (
    <div className="uf-journey">
      <section
        className="uf-recovery"
        id="regenicool-preview"
        aria-labelledby="regenicool-heading"
      >
        <header className="uf-recovery-heading" data-reveal>
          <p className="uf-kicker">From Unite Medical</p>
          <h2 id="regenicool-heading">
            RegeniCool<span>™</span>
          </h2>
          <p className="uf-recovery-model">Pro.</p>
        </header>
        <div className="uf-recovery-stage">
          <div className="uf-recovery-halo" aria-hidden="true" />
          <img
            className="uf-recovery-device"
            src="/media/regenicool/red-device.webp"
            width="1620"
            height="1620"
            alt="The red Unite RegeniCool Pro ice-water circulation unit"
            loading="lazy"
            decoding="async"
          />
          <span className="uf-recovery-stage-label" aria-hidden="true">
            Cold therapy. Water-based compression.
          </span>
        </div>
        <div className="uf-recovery-intro" data-reveal>
          <h3>One system. A choice of wraps.</h3>
          <p>
            Explore an ice-water circulation system with knee and hip
            configurations and additional compatible wrap options.
          </p>
          <div className="uf-journey-actions">
            <Link className="uf-button uf-button-green" to="/regenicool">
              Explore RegeniCool Pro <Icon.arrow />
            </Link>
            <Link className="uf-text-link" to="/regenicool#dealer-information">
              Request dealer information <Icon.arrow />
            </Link>
          </div>
          <p className="uf-recovery-note">
            Provider-directed use. Ice and water required.
          </p>
        </div>
        <div className="uf-recovery-details">
          <article data-reveal>
            <div
              className="uf-recovery-detail-image uf-recovery-detail-controls"
              role="img"
              aria-label="Close-up of the actual RegeniCool Pro control panel"
            />
            <p className="uf-recovery-detail-index">01 / The system</p>
            <h3>Cold, in circulation.</h3>
            <p>
              Water circulates from an ice-and-water reservoir through the
              connected wrap.
            </p>
          </article>
          <article data-reveal>
            <div
              className="uf-recovery-detail-image uf-recovery-detail-knee"
              role="img"
              aria-label="Actual red-trimmed RegeniCool 360-degree knee wrap"
            />
            <p className="uf-recovery-detail-index">
              02 / The knee configuration
            </p>
            <h3>Made to wrap around.</h3>
            <p>
              The device and carry-bag contents, paired with a 360° knee wrap
              with adjustable straps.
            </p>
          </article>
          <article data-reveal>
            <div
              className="uf-recovery-detail-image uf-recovery-detail-hip"
              role="img"
              aria-label="Actual red-trimmed RegeniCool hip wrap"
            />
            <p className="uf-recovery-detail-index">
              03 / The hip configuration
            </p>
            <h3>Another way to fit.</h3>
            <p>
              A hip-wrap configuration, with additional compatible wraps to
              explore with our team.
            </p>
          </article>
        </div>
      </section>

      <section className="uf-mission" aria-labelledby="government-heading">
        <div className="uf-mission-landscape" aria-hidden="true">
          <img
            src="/media/regenicool/woodland-dawn.webp"
            alt=""
            width="1536"
            height="1024"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="uf-mission-copy" data-reveal>
          <p className="uf-kicker">Veteran-owned. Georgia-based.</p>
          <h2 id="government-heading">
            Ready for the way
            <br />
            you procure.
          </h2>
          <p>
            Medical supplies, sourcing, and support for the people behind the
            care.
          </p>
          <Link className="uf-text-link" to="/government">
            Explore government purchasing <Icon.arrow />
          </Link>
        </div>
        <dl className="uf-mission-credentials" data-reveal>
          <div>
            <dt>MSPV BPA</dt>
            <dd>36C24123A0077</dd>
          </div>
          <div>
            <dt>CAGE code</dt>
            <dd>8MK70</dd>
          </div>
          <div>
            <dt>FDA registration</dt>
            <dd>3015727296</dd>
          </div>
        </dl>
      </section>

      <section
        className="uf-journey-contact"
        id="contact-unite"
        aria-labelledby="contact-heading"
      >
        <div className="uf-journey-contact-title" data-reveal>
          <p className="uf-kicker">Let’s find a way forward</p>
          <h2 id="contact-heading">
            Tell us what
            <br />
            you need.
          </h2>
        </div>
        <div className="uf-journey-contact-glass" data-reveal>
          <p>
            An everyday order, a hard-to-find product, or a private-label
            project. Share your requirements and our team will review the
            options with you.
          </p>
          <Link className="uf-button uf-button-light" to="/quote">
            Start a conversation <Icon.arrow />
          </Link>
          <a href="tel:+18338686483">
            Prefer to call? <span>833.868.6483 ↗</span>
          </a>
        </div>
      </section>
    </div>
  );
}
