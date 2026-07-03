import { useCallback, useEffect, useRef, useState } from 'react';
import { D } from '../../tokens.js';
import { Icon } from './Icon.jsx';

/**
 * Fullscreen image lightbox with keyboard + swipe navigation.
 *
 * Props:
 *   images:   [{ src, alt, label }]  required
 *   startIndex: number               default 0
 *   open:     boolean                required
 *   onClose:  () => void             required
 *
 * UX:
 *   - Click backdrop or close button to dismiss.
 *   - Left/Right arrow keys, on-screen arrow buttons, or horizontal swipe.
 *   - Esc closes.
 *   - Body scroll locked while open.
 *   - Thumbnails strip across the bottom.
 */
export function Lightbox({ images, startIndex = 0, open, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const touchStartX = useRef(null);

  // Reset to startIndex whenever the lightbox is reopened.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) setIdx(startIndex); }, [open, startIndex]);

  const next = useCallback(
    () => setIdx((i) => (i + 1) % Math.max(1, images.length)),
    [images.length],
  );
  const prev = useCallback(
    () => setIdx((i) => (i - 1 + Math.max(1, images.length)) % Math.max(1, images.length)),
    [images.length],
  );

  // Keyboard handlers + scroll lock.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, next, prev]);

  if (!open || !images?.length) return null;

  const current = images[idx] || images[0];
  const multi = images.length > 1;

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    touchStartX.current = null;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 14, 22, 0.92)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'umFadeIn 0.18s ease-out',
        padding: 'env(safe-area-inset-top, 12px) 12px env(safe-area-inset-bottom, 12px)',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close gallery"
        style={{
          position: 'absolute',
          top: 'max(env(safe-area-inset-top, 12px), 16px)',
          right: 16,
          width: 44,
          height: 44,
          borderRadius: 22,
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: D.paper,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <Icon.close />
      </button>

      <div
        style={{
          position: 'absolute',
          top: 'max(env(safe-area-inset-top, 12px), 18px)',
          left: 16,
          fontFamily: D.mono,
          fontSize: 11,
          letterSpacing: 1.2,
          color: 'rgba(243,242,235,0.8)',
        }}
      >
        {(current.label || `${idx + 1}/${images.length}`).toUpperCase()}{multi && current.label ? ` · ${idx + 1}/${images.length}` : ''}
      </div>

      {multi && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label="Previous image"
          style={{
            position: 'absolute',
            left: 'max(env(safe-area-inset-left, 8px), 12px)',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 52,
            height: 52,
            borderRadius: 26,
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: D.paper,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            zIndex: 2,
          }}
        >
          <Icon.arrow style={{ transform: 'rotate(180deg)' }} />
        </button>
      )}

      <img
        key={`${current.src}-${idx}`}
        src={current.src}
        alt={current.alt || ''}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(96vw, 1280px)',
          maxHeight: 'calc(100dvh - 180px)',
          objectFit: 'contain',
          background: D.paperAlt,
          borderRadius: 8,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6)',
          display: 'block',
          animation: 'umFadeIn 0.2s ease-out',
        }}
      />

      {multi && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label="Next image"
          style={{
            position: 'absolute',
            right: 'max(env(safe-area-inset-right, 8px), 12px)',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 52,
            height: 52,
            borderRadius: 26,
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: D.paper,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            zIndex: 2,
          }}
        >
          <Icon.arrow />
        </button>
      )}

      {multi && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 'max(env(safe-area-inset-bottom, 12px), 16px)',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 8,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: 6,
            borderRadius: 12,
            backdropFilter: 'blur(8px)',
            maxWidth: 'calc(100vw - 24px)',
            overflowX: 'auto',
          }}
        >
          {images.map((img, i) => (
            <button
              key={img.src}
              onClick={() => setIdx(i)}
              aria-label={`View ${img.label || i + 1}`}
              aria-current={i === idx ? 'true' : undefined}
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                overflow: 'hidden',
                border: i === idx ? `2px solid ${D.paper}` : '2px solid rgba(255,255,255,0.1)',
                background: D.paperAlt,
                padding: 0,
                cursor: 'pointer',
                opacity: i === idx ? 1 : 0.6,
                transition: 'opacity .15s, border-color .15s',
                flexShrink: 0,
              }}
            >
              {img.src ? (
                <img
                  src={img.src}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <span style={{ fontFamily: D.mono, fontSize: 9, color: D.ink2 }}>{img.label}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
