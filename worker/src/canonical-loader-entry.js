import entry from './entry-ui-getkey-script-embedded.js';

const DEFAULT_PRODUCTION_ORIGIN = 'https://frezen.frezenapp.workers.dev';
const LOADER_PATHS = [
  /^\/api\/v1\/scripts\/[^/]+\/embedded-loader\/?$/i,
  /^\/files\/[^/]+\.lua\/?$/i,
  /^\/loader\/[^/]+\/?$/i,
  /^\/compact-loader\/[^/]+\/?$/i,
];

export function canonicalLoaderOrigin(env, request) {
  const configured = String(env?.FREZEN_PUBLIC_ORIGIN || '').trim();
  const candidate = configured || (String(env?.FREZEN_ENV || '').trim().toLowerCase() === 'production' ? DEFAULT_PRODUCTION_ORIGIN : new URL(request.url).origin);
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') return new URL(request.url).origin;
    return parsed.origin;
  } catch {
    return new URL(request.url).origin;
  }
}

export function isLoaderRoute(pathname) {
  return LOADER_PATHS.some((pattern) => pattern.test(pathname));
}

export function normalizeLoaderRequest(request, env) {
  const source = new URL(request.url);
  if (!isLoaderRoute(source.pathname)) return request;
  const origin = canonicalLoaderOrigin(env, request);
  if (source.origin === origin) return request;
  const target = new URL(source.toString());
  const canonical = new URL(origin);
  target.protocol = canonical.protocol;
  target.host = canonical.host;
  return new Request(target.toString(), request);
}

export default {
  async fetch(request, env, ctx) {
    return entry.fetch(normalizeLoaderRequest(request, env), env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof entry.scheduled === 'function') return entry.scheduled(controller, env, ctx);
  },
};
