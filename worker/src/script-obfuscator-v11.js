const KEYWORDS = new Set([
  'and','break','do','else','elseif','end','false','for','function','goto','if','in','local','nil','not','or','repeat','return','then','true','until','while','continue',
]);

const SAFE_GLOBALS = new Set([
  '_G','_VERSION','assert','collectgarbage','coroutine','debug','dofile','error','getfenv','getmetatable','ipairs','load','loadfile','loadstring','next','pairs','pcall','print','rawequal','rawget','rawset','select','setfenv','setmetatable','tonumber','tostring','type','unpack','xpcall','math','string','table','utf8','bit32','bit','os','io','package','task','wait','spawn','delay','tick','time','game','workspace','script','Enum','Instance','Vector2','Vector3','Vector2int16','Vector3int16','CFrame','Color3','BrickColor','UDim','UDim2','Ray','Region3','Region3int16','PhysicalProperties','TweenInfo','NumberRange','NumberSequence','ColorSequence','DateTime','Axes','Faces','Random','Drawing','Players','ReplicatedStorage','RunService','HttpService','UserInputService','TweenService','CoreGui','Lighting','StarterGui','VirtualInputManager','getgenv','setgenv','gethui','cloneref','newcclosure','hookfunction','hookmetamethod','checkcaller','iscclosure','isexecutorclosure','identifyexecutor','request','http_request','syn','setclipboard','getclipboard','readfile','writefile','isfile','delfile','listfiles','makefolder','delfolder','setreadonly','isreadonly','getrawmetatable','setrawmetatable','getnamecallmethod','fireclickdetector','firetouchinterest','fireproximityprompt','getconnections','firesignal','queue_on_teleport','queueonteleport','setfpscap','getfpscap','Drawing','typeof'
]);

export const ADVANCED_V11_PROFILE = Object.freeze({
  version: '1.1',
  mode: 'Advanced Techniques',
  strength: 'VERY_HIGH',
  protectionLevel: 100,
  mangleNames: true,
  encodeStrings: true,
  encodeNumbers: true,
  controlFlow: true,
  controlFlowFlattening: true,
  deadCodeInjection: true,
  antiDebugging: true,
  minify: true,
  encryptionAlgorithm: 'xor',
});

const MAX_SOURCE_BYTES = 3 * 1024 * 1024;

function randomInt(min = 1000, max = 9999999) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomName(prefix = '__f') {
  return `${prefix}${randomInt(100000, 999999999)}`;
}

function readLongBracket(source, start) {
  if (source[start] !== '[') return null;
  let i = start + 1;
  while (source[i] === '=') i += 1;
  if (source[i] !== '[') return null;
  const close = ']' + '='.repeat(i - start - 1) + ']';
  const end = source.indexOf(close, i + 1);
  if (end < 0) return { value: source.slice(start), end: source.length };
  return { value: source.slice(start, end + close.length), end: end + close.length };
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '-' && n === '-') {
      const long = readLongBracket(source, i + 2);
      if (long) { i = long.end; continue; }
      const nl = source.indexOf('\n', i + 2);
      i = nl < 0 ? source.length : nl + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === quote) { j += 1; break; }
        j += 1;
      }
      tokens.push({ type: 'string', value: source.slice(i, j), raw: source.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '[') {
      const long = readLongBracket(source, i);
      if (long) {
        tokens.push({ type: 'string', value: long.value, raw: long.value });
        i = long.end;
        continue;
      }
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
      const value = source.slice(i, j);
      tokens.push({ type: 'identifier', value, raw: value });
      i = j;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(n || ''))) {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_.+-]/.test(source[j])) {
        const part = source[j];
        if (part === '+' || part === '-') {
          const prev = source[j - 1];
          if (prev !== 'e' && prev !== 'E') break;
        }
        j += 1;
      }
      tokens.push({ type: 'number', value: source.slice(i, j), raw: source.slice(i, j) });
      i = j;
      continue;
    }
    const three = source.slice(i, i + 3);
    const two = source.slice(i, i + 2);
    if (['...', '<<=', '>>='].includes(three)) {
      tokens.push({ type: 'symbol', value: three, raw: three });
      i += 3;
      continue;
    }
    if (['==','~=','<=','>=','..','//','<<','>>','+=','-=','*=','/=','%=','^=','::','->','&&','||'].includes(two)) {
      tokens.push({ type: 'symbol', value: two, raw: two });
      i += 2;
      continue;
    }
    tokens.push({ type: 'symbol', value: c, raw: c });
    i += 1;
  }
  return tokens;
}

function unescapeLuaString(raw) {
  if (raw.startsWith('[')) return raw.slice(1, -1);
  let body = raw.slice(1, -1);
  body = body.replace(/\\([\\\"'nrtbfv])/g, (_, ch) => ({ '\\': '\\', '"': '"', "'": "'", n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' }[ch] ?? ch));
  body = body.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  body = body.replace(/\\([0-9]{1,3})/g, (_, digits) => String.fromCharCode(Number(digits) & 0xff));
  return body;
}

function bytesFor(text) {
  const out = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code <= 0xff) out.push(code);
    else {
      const utf = new TextEncoder().encode(ch);
      for (const b of utf) out.push(b);
    }
  }
  return out;
}

function encodeString(text) {
  const bytes = bytesFor(text);
  if (!bytes.length) return '""';
  const key = randomInt(17, 251);
  const shifted = bytes.map((byte, index) => byte ^ (((key + index) % 255) + 1));
  return `(function(t,k)local s="";for i=1,#t do s=s..string.char(t[i]~(((k+i-1)%255)+1))end;return s end)({${shifted.join(',')}},${key})`;
}

function parseNumericLiteral(value) {
  const normalized = value.replace(/_/g, '');
  if (/^0[xX][0-9a-fA-F]+$/.test(normalized)) return parseInt(normalized.slice(2), 16);
  if (/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(normalized)) return Number(normalized);
  if (/^\.\d+(?:[eE][+-]?\d+)?$/.test(normalized)) return Number(normalized);
  return null;
}

function encodeNumber(value) {
  const numeric = parseNumericLiteral(value);
  if (numeric === null || !Number.isFinite(numeric)) return value;
  const delta = randomInt(3, 97);
  if (Number.isInteger(numeric) && Math.abs(numeric) < 3) return value;
  return `((${numeric + delta})-${delta})`;
}

function isMemberAccess(tokens, index) {
  const previous = tokens[index - 1]?.value;
  return previous === '.' || previous === ':' || previous === '::';
}

function discoverLocals(tokens) {
  const localNames = new Set();
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type !== 'identifier') continue;
    if (t.value === 'local') {
      let j = i + 1;
      if (tokens[j]?.value === 'function') j += 1;
      while (tokens[j] && tokens[j].value !== '=' && tokens[j].value !== 'do' && tokens[j].value !== 'then') {
        if (tokens[j].type === 'identifier' && !KEYWORDS.has(tokens[j].value)) localNames.add(tokens[j].value);
        if (tokens[j].value === ',') { j += 1; continue; }
        if (tokens[j].value === '(') break;
        j += 1;
      }
    }
    if (t.value === 'for') {
      let j = i + 1;
      while (tokens[j] && !['=', 'in', 'do'].includes(tokens[j].value)) {
        if (tokens[j].type === 'identifier') localNames.add(tokens[j].value);
        j += 1;
      }
    }
    if (t.value === 'function') {
      let j = i + 1;
      while (tokens[j] && tokens[j].value !== '(') j += 1;
      if (tokens[j]?.value === '(') {
        j += 1;
        while (tokens[j] && tokens[j].value !== ')') {
          if (tokens[j].type === 'identifier') localNames.add(tokens[j].value);
          j += 1;
        }
      }
    }
  }
  return localNames;
}

function mangleIdentifiers(tokens) {
  const locals = discoverLocals(tokens);
  const mapping = new Map();
  for (const token of tokens) {
    if (token.type !== 'identifier' || !locals.has(token.value)) continue;
    if (KEYWORDS.has(token.value) || SAFE_GLOBALS.has(token.value)) continue;
    if (!mapping.has(token.value)) mapping.set(token.value, randomName('__v'));
  }
  return tokens.map((token, index) => {
    if (token.type === 'identifier' && mapping.has(token.value) && !isMemberAccess(tokens, index)) {
      return { ...token, value: mapping.get(token.value), raw: mapping.get(token.value) };
    }
    return token;
  });
}

function transformControlFlow(tokens) {
  const out = [...tokens];
  for (let i = 0; i < out.length; i += 1) {
    if (!['if', 'while', 'until'].includes(out[i].value)) continue;
    const start = i + 1;
    let depth = 0;
    let j = start;
    while (j < out.length) {
      const value = out[j].value;
      if (['(', '{', '['].includes(value)) depth += 1;
      else if ([')', '}', ']'].includes(value)) depth = Math.max(0, depth - 1);
      if (depth === 0 && ((out[i].value === 'until' && value === ';') || (out[i].value !== 'until' && value === 'then'))) break;
      j += 1;
    }
    if (j <= start) continue;
    const condition = out.slice(start, j);
    const wrapped = [
      { type: 'symbol', value: '(', raw: '(' },
      ...condition,
      { type: 'identifier', value: 'and', raw: 'and' },
      { type: 'identifier', value: 'true', raw: 'true' },
      { type: 'identifier', value: 'or', raw: 'or' },
      { type: 'identifier', value: 'false', raw: 'false' },
      { type: 'symbol', value: ')', raw: ')' },
    ];
    out.splice(start, j - start, ...wrapped);
    i = start + wrapped.length - 1;
  }
  return out;
}

function renderTokens(tokens) {
  const parts = [];
  let previous = null;
  for (const token of tokens) {
    const current = token.raw ?? token.value;
    const needsSpace = previous && ((/[A-Za-z0-9_)]$/.test(previous) && /^[A-Za-z0-9_(]/.test(current)) || (previous === '-' && current.startsWith('-')));
    if (needsSpace) parts.push(' ');
    parts.push(current);
    previous = current;
  }
  return parts.join('');
}

function injectDeadCode() {
  const a = randomInt(11, 97);
  const b = a + randomInt(50, 500);
  const v = randomInt(1000, 99999);
  const dummy = randomName('__d');
  return `do local ${dummy}=${a};if (${dummy}+${a})==${b} then local _x=${v};for _i=1,3 do _x=_x+_i end end end`;
}

function injectAntiDebug() {
  const t = randomInt(500, 1500);
  return `do if type(debug)=="table" then error("Debug library detected",0) end;local _c=os and os.clock;if _c then local _a=_c();for _i=1,${t} do end;local _b=_c();if _b-_a>0.1 then error("Timing anomaly detected",0) end end;if _G and (_G._DEBUG or _G._TRACE or _G._HOOK) then error("Debug environment detected",0) end;if getfenv and _G and getfenv(0)~=_G then error("Environment manipulation detected",0) end end`;
}

function conservativeFlatten(code) {
  const forbidden = /\b(break|goto|::|repeat|while|for|return)\b/;
  if (forbidden.test(code)) return code;
  const lines = code.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3 || lines.length > 18) return code;
  const state = randomName('__s');
  const branches = [];
  lines.forEach((line, index) => {
    const stateNo = index + 1;
    const next = index + 1 < lines.length ? index + 2 : 0;
    branches.push(`${index === 0 ? 'if' : 'elseif'} ${state}==${stateNo} then ${line};${state}=${next}`);
  });
  return `do local ${state}=1;while ${state}~=0 do ${branches.join(' ')} end end`;
}

function minifySource(code) {
  return code.replace(/\s+/g, ' ').replace(/\s*([{}()\[\],;:+\-*\/%^<>=])\s*/g, '$1').trim();
}

export function obfuscateLuaV11(source) {
  const text = String(source ?? '');
  const sourceBytes = new TextEncoder().encode(text).byteLength;
  if (!text.trim()) throw new Error('EMPTY_LUA_SOURCE');
  if (sourceBytes > MAX_SOURCE_BYTES) throw new Error('LUA_SOURCE_TOO_LARGE');

  let tokens = tokenize(text);
  tokens = mangleIdentifiers(tokens);
  tokens = tokens.map((token) => {
    if (token.type === 'string') return { type: 'raw', value: encodeString(unescapeLuaString(token.raw)), raw: encodeString(unescapeLuaString(token.raw)) };
    if (token.type === 'number') return { type: 'raw', value: encodeNumber(token.value), raw: encodeNumber(token.value) };
    return token;
  });
  tokens = transformControlFlow(tokens);

  let body = renderTokens(tokens);
  body = conservativeFlatten(body);
  const prefix = [injectAntiDebug(), injectDeadCode()].join(' ');
  const result = minifySource(`${prefix} ${body}`);
  const outputBytes = new TextEncoder().encode(result).byteLength;
  if (outputBytes > MAX_SOURCE_BYTES) throw new Error('OBFUSCATED_LUA_TOO_LARGE');

  return {
    code: result,
    profile: ADVANCED_V11_PROFILE,
    sourceBytes,
    outputBytes,
  };
}

export function isAdvancedV11Obfuscated(value) {
  const text = String(value ?? '');
  return text.includes('Debug library detected') && text.includes('string.char') && /\bfunction\b/.test(text);
}
