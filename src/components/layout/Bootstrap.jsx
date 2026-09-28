import { useStartupReady } from '../../lib/startup.js';
import { useCartAuthSync } from '../../store/cart.js';
import { useAccountPricingBootstrap } from '../../lib/accountPricing.js';
import { useAccountBootstrap } from '../../lib/accountBootstrap.js';
import { useWmsWorkstationBootstrap } from '../../lib/wmsBootstrap.js';

/** Mounted once at app root — keeps the cart in sync with auth changes. */
export function Bootstrap() {
  const ready = useStartupReady();
  return ready ? <AccountBootstrap /> : null;
}

function AccountBootstrap() {
  useCartAuthSync();
  useAccountBootstrap();
  useWmsWorkstationBootstrap();
  useAccountPricingBootstrap();
  return null;
}
