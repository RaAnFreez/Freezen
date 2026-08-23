import baseEntry from './entry-ui-getkey.js';
import { enforceProviderProtectionBySlug, enforceProviderProtectionByFlow } from './provider-protection.js';

const NO_STORE = { 'cache-control': 'no-store' };

function getSlug(pathname) {
  if (!pathname.startsWith('/get-key/')) return null;
  const tail = pathname.slice('/get-key/'.length).replace(/\/+$/, '');
  if (!tail || tail.includes('/')) return null;
  try { return decodeURIComponent(tail); } catch { return null; }
}

async function injectProtectionScript(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  const script = `<script>
(() => {
  const originalFetch = window.fetch.bind(window);
  const detectBrowser = () => {
    const ua = navigator.userAgent || '';
    if (navigator.brave) return 'Brave';
    if (/FBAN|FBAV/i.test(ua)) return 'Facebook In-App Browser';
    if (/Instagram/i.test(ua)) return 'Instagram In-App Browser';
    if (/TikTok/i.test(ua)) return 'TikTok In-App Browser';
    if (/LinkedInApp/i.test(ua)) return 'LinkedIn In-App Browser';
    if (/Pinterest/i.test(ua)) return 'Pinterest In-App Browser';
    if (/Snapchat/i.test(ua)) return 'Snapchat In-App Browser';
    if (/GSA/i.test(ua)) return 'Google Search App';
    if (/;\\s*wv\\)/i.test(ua)) return 'WebView';
    if (/UCBrowser/i.test(ua)) return 'UC Browser';
    if (/QQBrowser/i.test(ua)) return 'QQ Browser';
    if (/YaBrowser/i.test(ua)) return 'Yandex Browser';
    if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
    if (/DuckDuckGo/i.test(ua)) return 'DuckDuckGo';
    if (/OPR\\//i.test(ua)) return 'Opera';
    if (/Vivaldi/i.test(ua)) return 'Vivaldi';
    if (/Edg\\//i.test(ua)) return 'Edge';
    if (/Chrome\\//i.test(ua) || /CriOS\\//i.test(ua)) return 'Chrome';
    if (/Firefox\\//i.test(ua) || /FxiOS\\//i.test(ua)) return 'Firefox';
    if (/Safari\\//i.test(ua) && !/Chrome|CriOS|Edg|OPR|Android/i.test(ua)) return 'Safari';
    if (/Android/i.test(ua)) return 'Android Browser';
    if (/Trident\\//i.test(ua) || /MSIE/i.test(ua)) return 'Internet Explorer';
    if (/Chromium/i.test(ua)) return 'Chromium';
    return 'Other/Unknown';
  };

  const detectAdblock = async () => {
    try {
      const bait = document.createElement('div');
      bait.className = 'adsbox ad-banner ad-unit adsbygoogle text-ad pub_300x250';
      bait.setAttribute('aria-hidden', 'true');
      bait.style.cssText = 'position:absolute!important;left:-10000px!important;top:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important;pointer-events:none!important;';
      document.body.appendChild(bait);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const style = getComputedStyle(bait);
      const blocked = bait.offsetParent === null || bait.offsetHeight === 0 || style.display === 'none' || style.visibility === 'hidden';
      bait.remove();
      return blocked;
    } catch {
      return false;
    }
  };

  const detectIncognito = async () => {
    const signals = [];
    try {
      if (navigator.storage?.estimate) {
        const result = await navigator.storage.estimate();
        const quota = Number(result?.quota || 0);
        if (quota > 0 && quota < 120 * 1024 * 1024) signals.push('quota');
      }
    } catch {}
    try {
      if (navigator.storage?.persisted) {
        const persisted = await navigator.storage.persisted();
        if (!persisted) signals.push('not-persisted');
      }
    } catch {}
    return signals.length >= 2;
  };

  let signalsPromise;
  const getSignals = () => {
    if (!signalsPromise) signalsPromise = Promise.allSettled([detectAdblock(), detectIncognito()]).then((values) => ({
      adblock: values[0]?.status === 'fulfilled' && values[0].value === true,
      incognito: values[1]?.status === 'fulfilled' && values[1].value === true,
    }));
    return signalsPromise;
  };

  const protectedPath = (url) => {
    try {
      const parsed = new URL(url, location.href);
      return parsed.pathname === '/api/v1/get-key/flow/start' || /^\/api\/v1\/get-key\/flow\/[^/]+\/launch$/.test(parsed.pathname);
    } catch {
      return false;
    }
  };

  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : String(input?.url || '');
    if (!protectedPath(requestUrl)) return originalFetch(input, init);
    const signals = await getSignals();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-frezen-client-browser', detectBrowser());
    if (signals.adblock) headers.set('x-frezen-adblock', '1');
    if (signals.incognito) headers.set('x-frezen-incognito', '1');
    return originalFetch(input, { ...init, headers });
  };
})();
</script>`;
  const body = html.replace('</body>', `${script}</body>`);
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  Object.entries(NO_STORE).forEach(([key, value]) => headers.set(key, value));
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/v1/get-key/flow/start') {
      let body = {};
      try { body = await request.clone().json(); } catch {}
      const slug = String(url.searchParams.get('slug') || body?.slug || '').trim().toLowerCase();
      const blocked = await enforceProviderProtectionBySlug(request, env, slug);
      if (blocked) return blocked;
    }

    const launchMatch = url.pathname.match(/^\/api\/v1\/get-key\/flow\/([^/]+)\/launch$/);
    if ((request.method === 'GET' || request.method === 'POST') && launchMatch) {
      const blocked = await enforceProviderProtectionByFlow(request, env, decodeURIComponent(launchMatch[1]));
      if (blocked) return blocked;
    }

    const response = await baseEntry.fetch(request, env, ctx);
    const slug = request.method === 'GET' ? getSlug(url.pathname) : null;
    return slug ? injectProtectionScript(response) : response;
  },
  async scheduled(controller, env, ctx) {
    if (typeof baseEntry.scheduled === 'function') return baseEntry.scheduled(controller, env, ctx);
  },
};