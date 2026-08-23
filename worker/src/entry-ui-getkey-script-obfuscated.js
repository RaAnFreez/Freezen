import protectedEntry from './entry-ui-getkey-protected.js';
import { obfuscateLuaV11, ADVANCED_V11_PROFILE } from './script-obfuscator-v11.js';

const MAX_LUA_BYTES = 512 * 1024;
const VERSION_UPLOAD_RE = /^\/api\/v1\/scripts\/([^/]+)\/versions$/;

function jsonError(code, message, status = 422, requestId = '') {
  return new Response(JSON.stringify({ error: code, message, request_id: requestId }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(requestId ? { 'x-frezen-request-id': requestId } : {}),
    },
  });
}

async function obfuscateVersionUpload(request) {
  const requestId = crypto.randomUUID();
  let form;
  try {
    form = await request.formData();
  } catch {
    return { response: jsonError('MULTIPART_FORM_DATA_REQUIRED', 'Lua version upload must use multipart/form-data.', 400, requestId) };
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return { response: jsonError('LUA_FILE_REQUIRED', 'A .lua file is required.', 400, requestId) };
  }
  if (file.size <= 0 || file.size > MAX_LUA_BYTES) {
    return { response: jsonError('LUA_FILE_TOO_LARGE_OR_EMPTY', 'The Lua source must be between 1 byte and 512 KiB.', 413, requestId) };
  }

  let source;
  try {
    source = await file.text();
  } catch {
    return { response: jsonError('LUA_FILE_READ_FAILED', 'The uploaded Lua file could not be read.', 400, requestId) };
  }

  let result;
  try {
    result = obfuscateLuaV11(source);
  } catch (error) {
    const message = String(error?.message || 'OBFUSCATION_FAILED');
    const status = message === 'OBFUSCATED_LUA_TOO_LARGE' ? 413 : 422;
    return { response: jsonError('OBFUSCATION_FAILED', message, status, requestId) };
  }

  if (result.outputBytes <= 0 || result.outputBytes > MAX_LUA_BYTES) {
    return { response: jsonError('OBFUSCATED_LUA_TOO_LARGE', 'The obfuscated Lua output exceeds the maximum delivery size.', 413, requestId) };
  }

  const forwardedForm = new FormData();
  for (const [key, value] of form.entries()) {
    if (key === 'file') {
      forwardedForm.append('file', new File([result.code], file.name, { type: 'text/x-lua' }));
    } else {
      forwardedForm.append(key, value);
    }
  }
  forwardedForm.set('obfuscation_version', ADVANCED_V11_PROFILE.version);
  forwardedForm.set('obfuscation_mode', ADVANCED_V11_PROFILE.mode);
  forwardedForm.set('obfuscation_strength', ADVANCED_V11_PROFILE.strength);
  forwardedForm.set('obfuscation_protection_level', String(ADVANCED_V11_PROFILE.protectionLevel));
  forwardedForm.set('obfuscation_algorithm', ADVANCED_V11_PROFILE.encryptionAlgorithm);

  const headers = new Headers(request.headers);
  headers.delete('content-type');
  headers.set('x-frezen-obfuscation', 'advanced-v1.1-very-high-100');
  headers.set('x-frezen-obfuscation-source-bytes', String(result.sourceBytes));
  headers.set('x-frezen-obfuscation-output-bytes', String(result.outputBytes));
  headers.set('x-frezen-obfuscation-request-id', requestId);

  const forwarded = new Request(request.url, {
    method: request.method,
    headers,
    body: forwardedForm,
  });

  return { request: forwarded };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = url.pathname.match(VERSION_UPLOAD_RE);
    if (request.method === 'POST' && match) {
      const result = await obfuscateVersionUpload(request);
      if (result.response) return result.response;
      return protectedEntry.fetch(result.request, env, ctx);
    }
    return protectedEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof protectedEntry.scheduled === 'function') return protectedEntry.scheduled(controller, env, ctx);
  },
};
