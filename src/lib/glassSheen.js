import { useEffect } from 'react';

/**
 * Global liquid-glass sheen driver.
 *
 * One delegated, rAF-throttled pointermove listener on the document
 * feeds `--mx` / `--sheen` to whichever `.um-glass-card` is under the
 * cursor, so the diagonal band of light (see .um-glass-card::before in
 * index.css) glides toward the pointer on every glass pane site-wide —
 * homepage metrics, the shortage strip, mastheads, anywhere.
 *
 * Mount once at the app root. No-ops for touch pointers and
 * prefers-reduced-motion.
 */
export function useGlassSheen() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0;
    let lastCard = null;
    const onMove = (e) => {
      if (e.pointerType === 'touch') return;
      const { clientX, target } = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const card = target.closest?.('.um-glass-card') || null;
        if (lastCard && lastCard !== card) lastCard.style.setProperty('--sheen', '0');
        if (card) {
          const r = card.getBoundingClientRect();
          card.style.setProperty('--mx', `${((clientX - r.left) / r.width) * 100}%`);
          card.style.setProperty('--sheen', '1');
        }
        lastCard = card;
      });
    };
    const onLeave = () => {
      if (lastCard) lastCard.style.setProperty('--sheen', '0');
      lastCard = null;
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}
