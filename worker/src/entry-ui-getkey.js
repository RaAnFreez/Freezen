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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/v1/get-key/checkpoint/callback') {
      return verifyClaimedGetKeyCallback(request, env, url.searchParams.get('token') || '');
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/get-key/service') {
      return getPublicGetKeyServiceMeta(env, url.searchParams.get('slug') || '');
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/get-key/flow/start') {
      let body = {};
      try { body = await request.clone().json(); } catch {}
      const slug = url.searchParams.get('slug') || body?.slug || '';
      return startClaimedGetKey(request, env, slug);
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
      return renderSlugGetKeyPage(slug);
    }

    return entryUi.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof entryUi.scheduled === 'function') return entryUi.scheduled(controller, env, ctx);
  },
};
