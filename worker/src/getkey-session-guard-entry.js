import baseEntry from './canonical-loader-entry.js';

const FLOW_ROUTE_RE = /^\/api\/v1\/get-key\/flow\/([^/]+)(?:\/launch)?\/?$/;
const SESSION_COOKIE = 'frezen_getkey_session';

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

async function cleanGetKeyRedirect(request, env, flowId) {
  if (!env?.DB || !flowId) return null;
  try {
    const row = await env.DB.prepare(`SELECT f.slug
      FROM getkey_public_sessions s
      JOIN frezen_key_services f ON f.id = s.service_id
      WHERE s.id = ?1 LIMIT 1`).bind(flowId).first();
    if (!row?.slug) return null;
    const target = new URL(`/get-key/${encodeURIComponent(row.slug)}`, request.url);
    return new Response(null, {
      status: 302,
      headers: {
        location: target.pathname,
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = url.pathname.match(FLOW_ROUTE_RE);
    if (request.method === 'GET' && match) {
      const flowId = decodeURIComponent(match[1]);
      const sessionId = readCookie(request, SESSION_COOKIE);
      if (!sessionId || sessionId !== flowId) {
        const redirected = await cleanGetKeyRedirect(request, env, flowId);
        if (redirected) return redirected;
      }
    }
    return baseEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseEntry.scheduled === 'function') return baseEntry.scheduled(controller, env, ctx);
  },
};
