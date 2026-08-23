import entryUi from './entry-ui.js';
import {
  getPublicGetKeyLicense,
  validatePublicGetKeyLicense,
} from './getkey-public-runtime.js';
import {
  startPublicGetKey as startClaimedGetKey,
  getPublicGetKeyState as getClaimedGetKeyState,
  launchPublicGetKeyCheckpoint as launchClaimedGetKeyCheckpoint,
} from './getkey-single-claim-service-id.js';
import { verifyGetKeyCheckpointCallback } from './getkey-callback-runtime.js';
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

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

async function recoverCompletedCallback(request, env, response) {
  if (response.status !== 404 || !env?.DB) return response;
  const body = await response.clone().json().catch(() => null);
  if (body?.error !== 'VERIFICATION_TOKEN_NOT_FOUND') return response;

  const sessionId = readCookie(request, 'frezen_getkey_session');
  if (!sessionId) return response;

  try {
    const session = await env.DB.prepare(`SELECT s.id, s.service_id, f.slug
      FROM getkey_public_sessions s
      JOIN frezen_key_services f ON f.id = s.service_id
      WHERE s.id = ?1 LIMIT 1`).bind(sessionId).first();
    if (!session?.id || !session?.slug) return response;

    const counts = await env.DB.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passed
      FROM getkey_public_checkpoints WHERE session_id = ?1`).bind(sessionId).first();
    const total = Number(counts?.total || 0);
    const passed = Number(counts?.passed || 0);
    if (!total || passed !== total) return response;

    const issued = await env.DB.prepare(
      'SELECT license_id FROM getkey_public_keys WHERE session_id = ?1 LIMIT 1',
    ).bind(sessionId).first();
    if (!issued?.license_id) return response;

    const location = `/get-key/${encodeURIComponent(session.slug)}?flow=${encodeURIComponent(sessionId)}&verified=1&unlocked=1`;
    return new Response(null, {
      status: 302,
      headers: {
        location,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Completed Get-Key callback recovery failed', {
      message: String(error?.message || error),
      session_id: sessionId,
    });
    return response;
  }
}

async function renderSlugPageWithDirectCheckpointRedirect(slug) {
  const response = renderSlugGetKeyPage(slug);
  const html = await response.text();
  const script = `<script>
(() => {
  globalThis.parseUtcTimestamp = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return NaN;
    const normalized = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(raw) ? raw : raw + 'Z';
    return new Date(normalized).getTime();
  };

  const flowStorageKey = 'frezen:getkey:flow:' + ${JSON.stringify(String(slug || ''))};
  const KEY_VALIDITY_MS = 24 * 60 * 60 * 1000;
  let expiryInterval = null;
  let expiryLoadedFor = null;

  const formatExpiry = (ms) => {
    if (!Number.isFinite(ms) || ms <= 0) return 'Expired';
    const total = Math.floor(ms / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (days > 0) return days + 'd ' + hours + 'h';
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    return minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
  };

  const resetExpiredFlow = () => {
    localStorage.removeItem(flowStorageKey);
    const next = new URL(location.href);
    next.searchParams.delete('flow');
    next.searchParams.delete('verified');
    next.searchParams.delete('unlocked');
    next.searchParams.delete('completed');
    location.replace(next.toString());
  };

  const updateExpiryUi = async () => {
    const flowId = new URL(location.href).searchParams.get('flow') || localStorage.getItem(flowStorageKey);
    if (!flowId) return;
    const keyCard = document.getElementById('keyCard');
    const keyValue = document.getElementById('keyValue');
    if (!keyCard || !keyValue || !keyValue.textContent.trim()) return;

    const labels = document.querySelectorAll('.info-label');
    const values = document.querySelectorAll('.info-value');
    const expiryLabel = labels[0];
    const expiryValue = values[0];
    if (!expiryLabel || !expiryValue) return;

    if (expiryLoadedFor !== flowId) {
      try {
        const response = await fetch('/api/v1/get-key/key/' + encodeURIComponent(flowId), { cache: 'no-store', credentials: 'same-origin' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.key || !data.generated_at) return;
        const generatedAt = new Date(data.generated_at).getTime();
        if (!Number.isFinite(generatedAt)) return;
        expiryLoadedFor = flowId;
        expiryLabel.textContent = 'Expired Key';
        if (expiryInterval) clearInterval(expiryInterval);
        const tick = () => {
          const remaining = generatedAt + KEY_VALIDITY_MS - Date.now();
          expiryValue.textContent = formatExpiry(remaining);
          if (remaining <= 0) {
            clearInterval(expiryInterval);
            expiryInterval = null;
            expiryValue.textContent = 'Expired';
            setTimeout(resetExpiredFlow, 400);
          }
        };
        tick();
        expiryInterval = setInterval(tick, 1000);
      } catch {}
      return;
    }

    expiryLabel.textContent = 'Expired Key';
  };

  const autoStartIfNeeded = () => {
    const button = document.getElementById('primary');
    if (!button || button.dataset.autoStarted === '1') return;

    const params = new URL(location.href).searchParams;
    const hasUrlFlow = Boolean(params.get('flow'));
    const savedFlow = localStorage.getItem(flowStorageKey);
    if (hasUrlFlow || savedFlow) return;

    const text = String(button.textContent || '').trim().toUpperCase();
    if (text !== 'START') return;

    button.dataset.autoStarted = '1';
    setTimeout(() => {
      if (!localStorage.getItem(flowStorageKey) && !new URL(location.href).searchParams.get('flow')) {
        button.click();
      }
    }, 250);
  };

  const observe = () => {
    autoStartIfNeeded();
    updateExpiryUi();
    const observer = new MutationObserver(() => {
      autoStartIfNeeded();
      updateExpiryUi();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    setTimeout(() => observer.disconnect(), 20000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe, { once: true });
  } else {
    observe();
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#primary, .ghost[data-launch]');
    if (!button) return;

    const isPrimary = button.id === 'primary';
    const text = String(button.textContent || '').trim().toUpperCase();
    let launchPath = button.dataset.launch || '';

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
      const callback = await verifyGetKeyCheckpointCallback(request, env, url.searchParams.get('token') || '');
      return recoverCompletedCallback(request, env, callback);
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