import { useEffect, useRef } from 'react';

/**
 * Scroll-reveal wrapper: children fade/slide up the first time they enter
 * the viewport. Pure presentation — degrades to fully-visible when
 * IntersectionObserver is unavailable or reduced motion is requested
 * (handled in CSS via .um-reveal rules).
 *
 * `delay` (ms) staggers siblings.
 */
export function Reveal({ children, delay = 0, style, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('um-revealed');
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('um-revealed');
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="um-reveal"
      style={delay ? { transitionDelay: `${delay}ms`, ...style } : style}
      {...rest}
    >
      {children}
    </div>
  );
}
