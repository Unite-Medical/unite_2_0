import { D } from '../../tokens.js';

/**
 * Inline gradient-text span.
 *
 * Uses `display: inline-block` + a hair of padding so that italic
 * glyph swashes (Fraunces etc.) actually get painted by background-clip.
 * Without this, WebKit crops the gradient to the text's EM box and
 * italic ascenders/descenders look "shaved" at the tips.
 */
export function Grad({ children, style = {} }) {
  return (
    <span className="um-grad-shimmer" style={{
      background: D.grad,
      // Extend the gradient past the box so italic swashes that sit
      // outside the EM box still get painted, not transparent.
      // Oversized on X so the shimmer keyframes have room to drift.
      backgroundSize: '180% 140%',
      backgroundPosition: 'center',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      fontStyle: 'italic',
      display: 'inline-block',
      // Italic glyphs slant right and have tall swashes/deep descenders
      // (g, y, p, b, h, d in Fraunces). Pad on every side so the
      // background-clip-text paint area covers the full glyph extents,
      // then negative-margin to cancel the layout impact pixel-for-pixel.
      paddingInlineStart: '0.06em',
      paddingInlineEnd: '0.18em',
      paddingBlockStart: '0.1em',
      paddingBlockEnd: '0.2em',
      marginInlineStart: '-0.06em',
      marginInlineEnd: '-0.18em',
      marginBlockStart: '-0.1em',
      marginBlockEnd: '-0.2em',
      // Match surrounding inline text exactly so italics don't shift vertically.
      lineHeight: 'inherit',
      verticalAlign: 'baseline',
      ...style,
    }}>
      {children}
    </span>
  );
}
