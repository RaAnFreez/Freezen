const textEncoder = new TextEncoder();

const toBase64Url = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (value) => {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function hmac(secret, value) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('MASTER_SECRET_UNAVAILABLE');
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)));
}

function safeLuaString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

export async function createEmbeddedDeliveryToken(env, scriptId, keyRecordId) {
  const payload = JSON.stringify({ v: 1, s: String(scriptId), k: String(keyRecordId) });
  const encoded = toBase64Url(textEncoder.encode(payload));
  const signature = toBase64Url(await hmac(env.FREZEN_MASTER_SECRET, encoded));
  return `fzl1.${encoded}.${signature}`;
}

export async function verifyEmbeddedDeliveryToken(env, token) {
  const value = String(token ?? '').trim();
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'fzl1' || !parts[1] || !parts[2]) return null;
  try {
    const expected = await hmac(env.FREZEN_MASTER_SECRET, parts[1]);
    const supplied = fromBase64Url(parts[2]);
    if (expected.length !== supplied.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ supplied[i];
    if (diff !== 0) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
    if (payload?.v !== 1 || !payload.s || !payload.k) return null;
    return { scriptId: String(payload.s), keyRecordId: String(payload.k) };
  } catch {
    return null;
  }
}

export function buildEmbeddedLoaderSource(request, scriptId, deliveryToken) {
  const origin = new URL(request.url).origin;
  const id = encodeURIComponent(scriptId);
  const endpoint = `${origin}/files/${id}.lua`;
  const token = safeLuaString(deliveryToken);
  return [
    '-- This file protect by Frezen Obfuscation',
    `local __frezen_delivery_token="${token}";`,
    'local HttpService=game:GetService("HttpService");',
    'local Players=game:GetService("Players");',
    'local hwid="";',
    'local game_username="";',
    'local game_user_id="";',
    'pcall(function()',
    '  local player=Players.LocalPlayer;',
    '  if not player then local ps=Players:GetPlayers();if #ps>0 then player=ps[1] end end;',
    '  if player then',
    '    local okName,name=pcall(function() return player.Name end);if okName and type(name)=="string" and name~="" then game_username=name end;',
    '    local okId,uid=pcall(function() return player.UserId end);if okId and uid then game_user_id=tostring(uid) end;',
    '  end;',
    'end);',
    'local okClient,clientId=pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end);',
    'if okClient and type(clientId)=="string" and clientId~="" then hwid=clientId end;',
    'if hwid=="" then error("FREZEN_HWID_UNAVAILABLE") end;',
    `local __frezen_url="${endpoint}?delivery_token="..HttpService:UrlEncode(__frezen_delivery_token).."&hwid="..HttpService:UrlEncode(hwid).."&game_username="..HttpService:UrlEncode(game_username).."&game_user_id="..HttpService:UrlEncode(game_user_id);`,
    'local __frezen_http_ok,source=pcall(function() return game:HttpGet(__frezen_url) end);',
    'if not __frezen_http_ok then error("FREZEN_PAYLOAD_HTTP_FAILED:"..tostring(source)) end;',
    'if type(source)~="string" or source=="" then error("FREZEN_PAYLOAD_EMPTY") end;',
    'local __frezen_load=loadstring or load;',
    'if type(__frezen_load)~="function" then error("FREZEN_LOADSTRING_UNAVAILABLE") end;',
    'local __frezen_chunk,__frezen_compile_error=__frezen_load(source);',
    'if type(__frezen_chunk)~="function" then error("FREZEN_PAYLOAD_COMPILE_FAILED:"..tostring(__frezen_compile_error)) end;',
    'local __frezen_run_ok,__frezen_run_error=pcall(__frezen_chunk);',
    'if not __frezen_run_ok then error("FREZEN_PAYLOAD_RUNTIME_FAILED:"..tostring(__frezen_run_error)) end;',
  ].join('\n');
}
