import { D } from '../../tokens.js';

/**
 * Accent span — the emphasis voice of the redesign.
 *
 * Keeps the surrounding upright sans-serif typography with a green accent.
 */
export function Grad({ children, style = {} }) {
  return (
    <span style={{
      fontStyle: 'normal',
      color: D.plum,
      lineHeight: 'inherit',
      verticalAlign: 'baseline',
      ...style,
    }}>
      {children}
    </span>
  );
}
