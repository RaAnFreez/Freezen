import entryUi from './entry-ui.js';
import {
  getPublicGetKeyLicense,
  validatePublicGetKeyLicense,
} from './getkey-public-runtime.js';
import {
  startPublicGetKey as startClaimedGetKey,
  getPublicGetKeyState as getClaimedGetKeyState,
  launchPublicGetKeyCheckpoint as launchClaimedGetKeyCheckpoint,
  verifyPublicGetKeyCallback as verifyClaimedGetKeyCallback,
} from './getkey-single-claim-service-id.js';
import { getPublicGetKeyServiceMeta } from './getkey-service-meta.js';
import { resolveGetKeyService } from './getkey-slug-resolver.js';
import { renderSlugGetKeyPage } from './getkey-slug-ui.js';

function getSlugFromPath(pathname) {
  const prefix = '/get-key/';
  if (!pathname.startsWith(prefix)) return null;
  const tail = pathname.slice(prefix.length).replace(/\/+$/, '');
  if (!tail || tail.includes('/')) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return null;
  }
}

async function renderSlugPageWithDirectCheckpointRedirect(slug) {
  const response = renderSlugGetKeyPage(slug);
  const html = await response.text();
  const script = `<script>
(() => {
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#primary, .ghost[data-launch]');
    if (!button) return;

    const isPrimary = button.id === 'primary';
    const text = String(button.textContent || '').trim().toUpperCase();
    let launchPath = button.dataset.launch || '';

    // START must still use the normal flow-creation handler. Once a flow exists,
    // CONTINUE should navigate to the Worker launch endpoint directly so its
    // HTTP 302 reaches the SafeLinkU short URL without a JSON-fetch round trip.
    if (isPrimary) {
      if (!text.includes('CONTINUE')) return;
      const flowId = new URL(location.href).searchParams.get('flow');
      if (!flowId) return;
      launchPath = '/api/v1/get-key/flow/' + encodeURIComponent(flowId) + '/launch';
    }

    if (!launchPath) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    window.location.assign(launchPath);
  }, true);
})();
</script>`;
  const body = html.replace('</body>', `${script}</body>`);
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/v1/get-key/checkpoint/callback') {
      return verifyClaimedGetKeyCallback(request, env, url.searchParams.get('token') || '');
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/get-key/service') {
      const requestedSlug = url.searchParams.get('slug') || '';
      const resolved = await resolveGetKeyService(env, requestedSlug);
      if (resolved.error) return new Response(JSON.stringify({ error: resolved.error }), {
        status: resolved.status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
      const response = await getPublicGetKeyServiceMeta(env, resolved.canonical_slug);
      if (resolved.alias && response.ok) {
        const body = await response.json().catch(() => ({}));
        body.requested_slug = resolved.requested_slug;
        body.service = { ...(body.service || {}), public_slug: resolved.requested_slug };
        return new Response(JSON.stringify(body), {
          status: response.status,
          headers: response.headers,
        });
      }
      return response;
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/get-key/flow/start') {
      let body = {};
      try { body = await request.clone().json(); } catch {}
      const requestedSlug = url.searchParams.get('slug') || body?.slug || '';
      const resolved = await resolveGetKeyService(env, requestedSlug);
      if (resolved.error) return new Response(JSON.stringify({ error: resolved.error }), {
        status: resolved.status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
      return startClaimedGetKey(request, env, resolved.canonical_slug);
    }

    const flowMatch = url.pathname.match(/^\/api\/v1\/get-key\/flow\/([^/]+)$/);
    if (request.method === 'GET' && flowMatch) {
      return getClaimedGetKeyState(request, env, decodeURIComponent(flowMatch[1]));
    }

    const launchMatch = url.pathname.match(/^\/api\/v1\/get-key\/flow\/([^/]+)\/launch$/);
    if (request.method === 'GET' && launchMatch) {
      return launchClaimedGetKeyCheckpoint(request, env, decodeURIComponent(launchMatch[1]));
    }

    const keyMatch = url.pathname.match(/^\/api\/v1\/get-key\/key\/([^/]+)$/);
    if (request.method === 'GET' && keyMatch) {
      return getPublicGetKeyLicense(request, env, decodeURIComponent(keyMatch[1]));
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/get-key/key/validate') {
      return validatePublicGetKeyLicense(request, env);
    }

    const slug = getSlugFromPath(url.pathname);
    if (request.method === 'GET' && slug) {
      return renderSlugPageWithDirectCheckpointRedirect(slug);
    }

    return entryUi.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof entryUi.scheduled === 'function') return entryUi.scheduled(controller, env, ctx);
  },
};