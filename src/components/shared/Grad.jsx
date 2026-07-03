import { D } from '../../tokens.js';

/**
 * Accent span — the emphasis voice of the redesign.
 *
 * Previously this painted an orange→plum gradient with a shimmer loop
 * (the single loudest "AI-generated" tell on the site). It now renders
 * as italic serif in the surgical-green accent: quiet, editorial, print.
 * All ~40 call sites keep working; only the voice changes.
 */
export function Grad({ children, style = {} }) {
  return (
    <span style={{
      fontStyle: 'italic',
      color: D.plum,
      // Give italic serif swashes a hair of breathing room without
      // shifting the surrounding line.
      paddingInlineEnd: '0.04em',
      lineHeight: 'inherit',
      verticalAlign: 'baseline',
      ...style,
    }}>
      {children}
    </span>
  );
}
