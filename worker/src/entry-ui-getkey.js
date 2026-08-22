import entryUi from './entry-ui.js';
import {
  getPublicGetKeyLicense,
  validatePublicGetKeyLicense,
  publicGetKeyPage,
} from './getkey-public-runtime.js';
import { enhanceGetKeyPage } from './getkey-custom-page-ui.js';
import { withGetKeyServiceResolver } from './getkey-service-id-resolver.js';
import {
  startPublicGetKey as startClaimedGetKey,
  getPublicGetKeyState as getClaimedGetKeyState,
  launchPublicGetKeyCheckpoint as launchClaimedGetKeyCheckpoint,
  verifyPublicGetKeyCallback as verifyClaimedGetKeyCallback,
} from './getkey-single-claim.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const getKeyEnv = withGetKeyServiceResolver(env);

    if (request.method === 'GET' && url.pathname === '/api/v1/get-key/checkpoint/callback') {
      return verifyClaimedGetKeyCallback(request, getKeyEnv, url.searchParams.get('token') || '');
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/get-key/flow/start') {
      let body = {};
      try { body = await request.clone().json(); } catch {}
      const slug = url.searchParams.get('slug') || body?.slug || '';
      return startClaimedGetKey(request, getKeyEnv, slug);
    }

    const flowMatch = url.pathname.match(/^\/api\/v1\/get-key\/flow\/([^/]+)$/);
    if (request.method === 'GET' && flowMatch) {
      return getClaimedGetKeyState(request, getKeyEnv, decodeURIComponent(flowMatch[1]));
    }

    const launchMatch = url.pathname.match(/^\/api\/v1\/get-key\/flow\/([^/]+)\/launch$/);
    if (request.method === 'GET' && launchMatch) {
      return launchClaimedGetKeyCheckpoint(request, getKeyEnv, decodeURIComponent(launchMatch[1]));
    }

    const keyMatch = url.pathname.match(/^\/api\/v1\/get-key\/key\/([^/]+)$/);
    if (request.method === 'GET' && keyMatch) {
      return getPublicGetKeyLicense(request, getKeyEnv, decodeURIComponent(keyMatch[1]));
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/get-key/key/validate') {
      return validatePublicGetKeyLicense(request, getKeyEnv);
    }

    const pageMatch = url.pathname.match(/^\/get-key\/([^/]+)\/?$/);
    if (request.method === 'GET' && pageMatch) {
      const page = publicGetKeyPage(decodeURIComponent(pageMatch[1]));
      return enhanceGetKeyPage(page);
    }

    return entryUi.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof entryUi.scheduled === 'function') return entryUi.scheduled(controller, env, ctx);
  },
};
