import protectedEntry from './entry-ui-getkey-protected.js';
import { obfuscateLuaV11, ADVANCED_V11_PROFILE } from './script-obfuscator-v11.js';
import { MAX_LUA_BYTES, OBFUSCATION_MARKER, isFrezenObfuscated } from './script-obfuscation-contract.js';

const VERSION_UPLOAD_RE = /^\/api\/v1\/scripts\/([^/]+)\/versions$/;

function jsonError(code, message, status = 422, requestId = '', details = {}) {
  return new Response(JSON.stringify({ error: code, message, details, request_id: requestId }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(requestId ? { 'x-frezen-request-id': requestId } : {}),
    },
  });
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The Advanced v1.1 encoder historically emitted Luau's binary `~` XOR operator.
// Some Lua runtimes used by executors reject that syntax during compilation. Keep
// the XOR algorithm but emit a parser-compatible decoder with a bit32 fast path and
// a pure-arithmetic fallback instead of shipping the incompatible operator.
export function normalizeLuaRuntimeCompatibility(code) {
  const binaryXorExpression = /t\[i\]~\(\(\(k\+i-1\)%255\)\+1\)/g;
  const compatibleXor = '(function(a,b)local bx=bit32 and bit32.bxor;if type(bx)=="function" then return bx(a,b) end;local r,p=0,1;while a>0 or b>0 do local x=a%2;local y=b%2;if x~=y then r=r+p end;a=(a-x)/2;b=(b-y)/2;p=p*2 end;return r end)(t[i],(((k+i-1)%255)+1))';
  return String(code ?? '').replace(binaryXorExpression, compatibleXor);
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
    return { response: jsonError('LUA_FILE_TOO_LARGE_OR_EMPTY', 'The Lua source must be between 1 byte and 3 MiB.', 413, requestId) };
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
    result.code = normalizeLuaRuntimeCompatibility(result.code);
    result.code = result.code.replace(/([A-Za-z0-9_)\]])--([A-Za-z_(])/g, '$1- -$2');
    result.code = `${OBFUSCATION_MARKER}\n${result.code}`;
    result.outputBytes = new TextEncoder().encode(result.code).byteLength;
  } catch (error) {
    const message = String(error?.message || 'OBFUSCATION_FAILED');
    const status = message === 'OBFUSCATED_LUA_TOO_LARGE' ? 413 : 422;
    return { response: jsonError('OBFUSCATION_FAILED', message, status, requestId) };
  }

  if (!isFrezenObfuscated(result.code)) {
    return { response: jsonError('OBFUSCATION_VERIFICATION_FAILED', 'The obfuscation output did not contain the Frezen delivery marker.', 422, requestId) };
  }
  if (result.outputBytes <= 0 || result.outputBytes > MAX_LUA_BYTES) {
    return { response: jsonError('OBFUSCATED_LUA_TOO_LARGE', 'The obfuscated Lua output exceeds the maximum 3 MiB delivery size.', 413, requestId) };
  }

  const payloadSha256 = await sha256Hex(result.code);
  const forwardedForm = new FormData();
  for (const [key, value] of form.entries()) {
    if (key === 'file') forwardedForm.append('file', new File([result.code], file.name, { type: 'text/x-lua' }));
    else forwardedForm.append(key, value);
  }
  forwardedForm.set('obfuscation_version', ADVANCED_V11_PROFILE.version);
  forwardedForm.set('obfuscation_mode', ADVANCED_V11_PROFILE.mode);
  forwardedForm.set('obfuscation_strength', ADVANCED_V11_PROFILE.strength);
  forwardedForm.set('obfuscation_protection_level', String(ADVANCED_V11_PROFILE.protectionLevel));
  forwardedForm.set('obfuscation_algorithm', ADVANCED_V11_PROFILE.encryptionAlgorithm);
  forwardedForm.set('obfuscation_status', 'verified');
  forwardedForm.set('obfuscation_payload_sha256', payloadSha256);
  forwardedForm.set('obfuscation_source_bytes', String(result.sourceBytes));
  forwardedForm.set('obfuscation_output_bytes', String(result.outputBytes));
  forwardedForm.set('obfuscation_compatibility_mode', result.compatibilityMode ? 'safe' : 'standard');

  const headers = new Headers(request.headers);
  headers.delete('content-type');
  headers.set('x-frezen-obfuscation', 'advanced-v1.1-very-high-100');
  headers.set('x-frezen-obfuscation-status', 'verified');
  headers.set('x-frezen-obfuscation-source-bytes', String(result.sourceBytes));
  headers.set('x-frezen-obfuscation-output-bytes', String(result.outputBytes));
  headers.set('x-frezen-obfuscation-sha256', payloadSha256);
  headers.set('x-frezen-obfuscation-request-id', requestId);

  return { request: new Request(request.url, { method: request.method, headers, body: forwardedForm }) };
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
