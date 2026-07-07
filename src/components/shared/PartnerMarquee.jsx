import { useState } from 'react';
import { D } from '../../tokens.js';

/**
 * Partner / customer logo set.
 *
 * Each entry has a slug that maps to /public/logos/partners/processed/{slug}--{variant}.svg
 * with a matching PNG fallback at /public/logos/partners/raster-fallback/{slug}--{variant}.png.
 *
 * The `tall` flag bumps render height for stacked / square marks (seals etc.)
 * so they read at the same visual weight as horizontal wordmarks.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_PARTNER_LOGOS = [
  { slug: 'restore-robotics',       name: 'Restore Robotics' },
  { slug: 'gopuff',                 name: 'goPuff' },
  { slug: 'veterans-affairs',       name: 'U.S. Department of Veterans Affairs', tall: true },
  { slug: 'publix',                 name: 'Publix' },
  { slug: 'henry-ford-hospital',    name: 'Henry Ford Hospital' },
  { slug: 'ardent-health',          name: 'Ardent Health' },
  { slug: 'harps-food',             name: 'Harps Food Stores' },
  { slug: 'uf-health',              name: 'UF Health' },
  { slug: 'orlando-health',         name: 'Orlando Health' },
  { slug: 'total-joint-specialists', name: 'Total Joint Specialists' },
];

function PartnerLogo({ slug, name, tall, variant, height }) {
  const h = tall ? Math.round(height * 1.15) : height;
  const svg = `/logos/partners/processed/${slug}--${variant}.svg`;
  const png = `/logos/partners/raster-fallback/${slug}--${variant}.png`;
  // When no logo asset exists for a slug, render a styled text wordmark instead
  // of hiding the entry. This lets the list be edited by NAME alone — real
  // logos can be dropped into /public/logos/partners/ later with no code change.
  const [textFallback, setTextFallback] = useState(false);

  if (textFallback) {
    return (
      <span
        title={name}
        style={{
          fontFamily: D.sans,
          fontWeight: 600,
          fontSize: Math.round(h * 0.62),
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          color: variant === 'paper' ? D.paper : D.ink,
          opacity: 0.7,
          flexShrink: 0,
        }}
      >
        {name}
      </span>
    );
  }

  return (
    <img
      src={svg}
      alt={name}
      title={name}
      loading="lazy"
      decoding="async"
      style={{
        height: h,
        width: 'auto',
        display: 'block',
        flexShrink: 0,
        opacity: 0.78, // softens the wordmarks so they sit behind the design rather than competing
      }}
      onError={(e) => {
        // SVG failed -> try PNG -> finally a styled text wordmark (never blank).
        if (e.currentTarget.dataset.fallback) {
          setTextFallback(true);
          return;
        }
        e.currentTarget.dataset.fallback = '1';
        e.currentTarget.src = png;
      }}
    />
  );
}

export function PartnerMarquee({
  items = DEFAULT_PARTNER_LOGOS,
  background = D.paperAlt,
  borderColor = D.line,
  eyebrow = 'TRUSTED BY THE FRONT LINE',
  reverse = false,
  speed = 'normal',
  showEyebrow = true,
  variant = 'ink',
  height = 28,
  eyebrowColor = D.plum,
}) {
  const speedClass = speed === 'slow' ? ' um-marquee--slow' : '';
  const dirClass = reverse ? ' um-marquee--reverse' : '';
  // Double the list so the loop seams invisibly.
  const doubled = [...items, ...items];

  return (
    <section
      aria-label="Partners and customers"
      style={{
        borderTop: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        background,
        padding: showEyebrow ? '20px 0 22px' : '22px 0',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {showEyebrow && (
        <div
          style={{
            maxWidth: 1360,
            margin: '0 auto',
            padding: '0 40px 14px',
            fontFamily: D.mono,
            fontSize: 11,
            letterSpacing: 1.4,
            color: eyebrowColor,
          }}
        >
          {eyebrow}
        </div>
      )}
      <div
        className="um-marquee-pause"
        style={{
          maskImage:
            'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
        }}
      >
        <div
          className={`um-marquee${dirClass}${speedClass}`}
          style={{
            gap: 64,
            alignItems: 'center',
            paddingRight: 64,
          }}
        >
          {doubled.map((item, i) => (
            <div
              key={`${item.slug}-${i}`}
              aria-hidden={i >= items.length}
              style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <PartnerLogo
                slug={item.slug}
                name={item.name}
                tall={item.tall}
                variant={variant}
                height={height}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
