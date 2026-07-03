import { useCartAuthSync } from '../../store/cart.js';

/** Mounted once at app root — keeps the cart in sync with auth changes. */
export function Bootstrap() {
  useCartAuthSync();
  return null;
}
