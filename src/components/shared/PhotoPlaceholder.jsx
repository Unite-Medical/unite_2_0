import { useState } from 'react';
import { D } from '../../tokens.js';

export function PhotoPlaceholder({
  caption,
  src,
  alt,
  height = 280,
  stripeFrom = '#e9e4dc',
  stripeTo = '#dfd8cd',
  textColor = 'rgba(40,30,20,.55)',
  radius = 2,
  objectPosition = 'center',
  eager = false, // set for above-the-fold heroes so LCP isn't lazy-loaded
  children,
}) {
  // If the provided src 404s, gracefully fall back to the stripe placeholder
  // so missing thumbnails don't render a broken image icon.
  const [errored, setErrored] = useState(false);

  if (src && !errored) {
    return (
      <div
        style={{
          height,
          borderRadius: radius,
          overflow: 'hidden',
          position: 'relative',
          background: stripeFrom,
        }}
      >
        <img
          src={src}
          alt={alt || caption || ''}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          onError={() => setErrored(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition,
            display: 'block',
          }}
        />
        {children}
      </div>
    );
  }
  const pattern = `repeating-linear-gradient(135deg, ${stripeFrom} 0 10px, ${stripeTo} 10px 20px)`;
  return (
    <div
      style={{
        height,
        borderRadius: radius,
        background: pattern,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-end',
        padding: 14,
      }}
    >
      <div
        style={{
          fontFamily: D.mono,
          fontSize: 11,
          letterSpacing: 0.4,
          color: textColor,
          background: 'rgba(255,255,255,.55)',
          padding: '4px 8px',
          borderRadius: 1,
        }}
      >
        photo · {caption}
      </div>
      {children}
    </div>
  );
}
