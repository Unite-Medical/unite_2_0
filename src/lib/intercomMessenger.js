const PUBLIC_PATH = /^\/(?:$|catalog(?:\/|$)|products?(?:\/|$)|about(?:\/|$)|contact(?:\/|$)|support(?:\/|$)|services(?:\/|$)|segments(?:\/|$)|blog(?:\/|$)|resources(?:\/|$)|regenicool(?:\/|$)|compliance(?:\/|$)|locations(?:\/|$)|careers(?:\/|$)|portfolio(?:\/|$)|procurement(?:\/|$)|government(?:\/|$)|privacy$|terms$|returns$|shipping$)/;

export function messengerAllowed(location) {
  return location.hostname === 'staging.unitemedical.net'
    && PUBLIC_PATH.test(location.pathname)
    && !location.search && !location.hash;
}

// Visitor chat only. Account identity and order data require a separate verified integration.
export function createMessenger(win, doc, appId) {
  let active = false;
  let lastPath = '';
  return {
    reset() {
      if (active) win.Intercom?.('shutdown');
      active = false;
      lastPath = '';
    },
    sync(location) {
      if (!messengerAllowed(location)) {
        if (active) win.Intercom?.('shutdown');
        active = false;
        lastPath = '';
        return;
      }
      if (typeof win.Intercom !== 'function') {
        const queue = (...args) => queue.q.push(args);
        queue.q = [];
        win.Intercom = queue;
      }
      if (!active) {
        win.Intercom('boot', { app_id: appId, api_base: 'https://api-iam.intercom.io' });
        active = true;
      } else if (lastPath !== location.pathname) {
        win.Intercom('update');
      }
      lastPath = location.pathname;
      if (!doc.getElementById('unite-intercom-widget')) {
        const script = doc.createElement('script');
        script.id = 'unite-intercom-widget';
        script.async = true;
        script.src = `https://widget.intercom.io/widget/${appId}`;
        script.onerror = () => {
          active = false;
          script.remove();
        };
        doc.head.appendChild(script);
      }
    },
  };
}
