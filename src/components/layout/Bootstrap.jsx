import { useCartAuthSync } from '../../store/cart.js';
import { useGlassSheen } from '../../lib/glassSheen.js';

/** Mounted once at app root — keeps the cart in sync with auth changes
 *  and drives the cursor-glide sheen on every .um-glass-card. */
export function Bootstrap() {
  useCartAuthSync();
  useGlassSheen();
  return null;
}
