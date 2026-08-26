const KEYWORDS = new Set([
  'and','break','do','else','elseif','end','false','for','function','goto','if','in','local','nil','not','or','repeat','return','then','true','until','while','continue',
]);

const SAFE_GLOBALS = new Set([
  '_G','_ENV','_VERSION','assert','collectgarbage','coroutine','debug','dofile','error','getfenv','getmetatable','ipairs','load','loadfile','loadstring','next','pairs','pcall','print','rawequal','rawget','rawset','select','setfenv','setmetatable','tonumber','tostring','type','unpack','xpcall','math','string','table','utf8','bit32','bit','os','io','package','task','wait','spawn','delay','tick','time','game','workspace','script','Enum','Instance','Vector2','Vector3','Vector2int16','Vector3int16','CFrame','Color3','BrickColor','UDim','UDim2','Ray','Region3','Region3int16','PhysicalProperties','TweenInfo','NumberRange','NumberSequence','ColorSequence','DateTime','Axes','Faces','Random','Drawing','Players','ReplicatedStorage','RunService','HttpService','UserInputService','TweenService','CoreGui','Lighting','StarterGui','VirtualInputManager','getgenv','setgenv','gethui','cloneref','newcclosure','hookfunction','hookmetamethod','checkcaller','iscclosure','isexecutorclosure','identifyexecutor','request','http_request','syn','setclipboard','getclipboard','readfile','writefile','isfile','delfile','listfiles','makefolder','delfolder','setreadonly','isreadonly','getrawmetatable','setrawmetatable','getnamecallmethod','fireclickdetector','firetouchinterest','fireproximityprompt','getconnections','firesignal','queue_on_teleport','queueonteleport','setfpscap','getfpscap','typeof',
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

export const MAX_SOURCE_BYTES = 3 * 1024 * 1024;

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
  const level = i - start - 1;
  const close = `]${'='.repeat(level)}]`;
  const end = source.indexOf(close, i + 1);
  if (end < 0) throw new Error('UNTERMINATED_LONG_BRACKET');
  return { value: source.slice(start, end + close.length), end: end + close.length, level };
}

function tokenize(source, { keepComments = false } = {}) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];

    if (/\s/.test(c)) {
      i += 1;
      continue;
    }

    if (c === '-' && n === '-') {
      const long = readLongBracket(source, i + 2);
      if (long) {
        if (keepComments) tokens.push({ type: 'comment', value: source.slice(i, long.end), raw: source.slice(i, long.end) });
        i = long.end;
        continue;
      }
      const nl = source.indexOf('\n', i + 2);
      if (keepComments) tokens.push({ type: 'comment', value: source.slice(i, nl < 0 ? source.length : nl), raw: source.slice(i, nl < 0 ? source.length : nl) });
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
      if (j > source.length || source[j - 1] !== quote) throw new Error('UNTERMINATED_STRING');
      tokens.push({ type: 'string', value: source.slice(i, j), raw: source.slice(i, j) });
      i = j;
      continue;
    }

    if (c === '[') {
      const long = readLongBracket(source, i);
      if (long) {
        tokens.push({ type: 'long_string', value: long.value, raw: long.value, level: long.level });
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
      while (j < source.length && /[A-Za-z0-9_.]/.test(source[j])) j += 1;
      if ((source[j] === '+' || source[j] === '-') && /[eE]/.test(source[j - 1] || '')) {
        j += 1;
        while (j < source.length && /[0-9_]/.test(source[j])) j += 1;
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

function decodeQuotedLuaString(raw) {
  let body = raw.slice(1, -1);
  body = body.replace(/\\([\\"'nrtbfv])/g, (_, ch) => ({
    '\\': '\\', '"': '"', "'": "'", n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v',
  }[ch] ?? ch));
  body = body.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  body = body.replace(/\\([0-9]{1,3})/g, (_, digits) => String.fromCharCode(Number(digits) & 0xff));
  return body;
}

function decodeLongLuaString(raw) {
  let i = 1;
  while (raw[i] === '=') i += 1;
  const level = i - 1;
  const close = `]${'='.repeat(level)}]`;
  return raw.slice(i + 1, raw.endsWith(close) ? -close.length : undefined);
}

function bytesFor(text) {
  return [...new TextEncoder().encode(text)];
}

function encodeString(text) {
  const bytes = bytesFor(text);
  if (!bytes.length) return '""';
  const key = randomInt(17, 251);
  const encoded = bytes.map((byte, index) => byte ^ (((key + index) % 255) + 1));
  // Pure arithmetic decoder: compatible with Lua/Luau runtimes without a binary XOR operator.
  return `(function(t,k)local s="";for i=1,#t do local a=t[i];local b=((k+i-1)%255)+1;local r,p=0,1;while a>0 or b>0 do local x=a%2;local y=b%2;if x~=y then r=r+p end;a=(a-x)/2;b=(b-y)/2;p=p*2 end;s=s..string.char(r)end;return s end)({${encoded.join(',')}},${key})`;
}

function parseInteger(value) {
  const normalized = value.replace(/_/g, '');
  if (/^0[xX][0-9a-fA-F]+$/.test(normalized)) return parseInt(normalized.slice(2), 16);
  if (/^[0-9]+$/.test(normalized)) return Number(normalized);
  if (/^-\d+$/.test(normalized)) return Number(normalized);
  return null;
}

function encodeNumber(value) {
  const numeric = parseInteger(value);
  if (numeric === null || !Number.isSafeInteger(numeric)) return value;
  if (Math.abs(numeric) < 3 || Math.abs(numeric) > 1000000000) return value;
  const delta = randomInt(3, 97);
  return `((${numeric + delta})-${delta})`;
}

function declarationNames(tokens) {
  const counts = new Map();
  const parameters = new Set();
  const add = (name) => counts.set(name, (counts.get(name) ?? 0) + 1);
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type !== 'identifier') continue;
    if (tokens[i].value === 'local') {
      let j = i + 1;
      if (tokens[j]?.value === 'function') {
        if (tokens[j + 1]?.type === 'identifier') add(tokens[j + 1].value);
        continue;
      }
      while (tokens[j] && !['=', 'do', 'then'].includes(tokens[j].value)) {
        if (tokens[j].type === 'identifier' && !KEYWORDS.has(tokens[j].value)) add(tokens[j].value);
        if (tokens[j].value === '(') break;
        j += 1;
      }
    }
    if (tokens[i].value === 'for') {
      let j = i + 1;
      while (tokens[j] && !['=', 'in', 'do'].includes(tokens[j].value)) {
        if (tokens[j].type === 'identifier') add(tokens[j].value);
        j += 1;
      }
    }
    if (tokens[i].value === 'function') {
      let j = i + 1;
      while (tokens[j] && tokens[j].value !== '(') j += 1;
      if (tokens[j]?.value === '(') {
        j += 1;
        while (tokens[j] && tokens[j].value !== ')') {
          if (tokens[j].type === 'identifier' && !KEYWORDS.has(tokens[j].value)) parameters.add(tokens[j].value);
          j += 1;
        }
      }
    }
  }
  return { counts, parameters };
}

function conservativeMangle(tokens) {
  const { counts, parameters } = declarationNames(tokens);
  const mapping = new Map();
  for (const [name, count] of counts.entries()) {
    if (count !== 1 || parameters.has(name) || KEYWORDS.has(name) || SAFE_GLOBALS.has(name)) continue;
    mapping.set(name, randomName('__v'));
  }
  if (!mapping.size) return tokens;
  return tokens.map((token, index) => {
    if (token.type !== 'identifier' || !mapping.has(token.value)) return token;
    const prev = tokens[index - 1]?.value;
    const next = tokens[index + 1]?.value;
    // Never rename member access, labels, or likely table-field keys.
    if (prev === '.' || prev === ':' || prev === '::' || next === ':') return token;
    return { ...token, value: mapping.get(token.value), raw: mapping.get(token.value) };
  });
}

function renderTokens(tokens, { minify = true, keepComments = false } = {}) {
  const parts = [];
  let previous = null;
  const word = (value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
  for (const token of tokens) {
    if (token.type === 'comment' && !keepComments) continue;
    const current = token.raw ?? token.value;
    if (!current) continue;
    let separator = '';
    if (previous !== null) {
      const needWordBoundary = (word(previous) && word(current)) ||
        (/[0-9]$/.test(previous) && /^[A-Za-z_]/.test(current)) ||
        (/^[A-Za-z_]/.test(previous) && /^[0-9]/.test(current));
      const needMinusGuard = previous.endsWith('-') && current.startsWith('-');
      const needDotGuard = previous.endsWith('.') && current.startsWith('.');
      const needCommentGuard = previous.endsWith('/') && current.startsWith('*');
      if (needWordBoundary || needMinusGuard || needDotGuard || needCommentGuard) separator = ' ';
      else if (!minify && (word(previous) || word(current))) separator = ' ';
    }
    parts.push(separator, current);
    previous = current;
  }
  return parts.join('');
}

function containsCompatibilitySensitiveCode(source) {
  return /\b(coroutine|loadstring|load)\s*\(|\b(getfenv|setfenv)\b|\b_ENV\b|\bsetmetatable\b|\bgetmetatable\b|\bdebug\b|\b__index\b|\b__newindex\b/i.test(source);
}

export function obfuscateLuaV11(source, options = {}) {
  const text = String(source ?? '');
  const sourceBytes = new TextEncoder().encode(text).byteLength;
  if (!text.trim()) throw new Error('EMPTY_LUA_SOURCE');
  if (sourceBytes > MAX_SOURCE_BYTES) throw new Error('LUA_SOURCE_TOO_LARGE');

  const compatibilityMode = containsCompatibilitySensitiveCode(text);
  const minify = options.minify !== false;
  const keepComments = options.keepComments === true;
  let tokens = tokenize(text, { keepComments });

  // Compatibility-first: do not rewrite or wrap control-flow structures.
  // The former implementation could alter return/yield/loop semantics without a visible console error.
  if (!compatibilityMode && options.mangleNames !== false) tokens = conservativeMangle(tokens);

  tokens = tokens.map((token) => {
    if (token.type === 'string') {
      const encoded = encodeString(decodeQuotedLuaString(token.raw));
      return { type: 'raw', value: encoded, raw: encoded };
    }
    if (token.type === 'long_string') {
      const encoded = encodeString(decodeLongLuaString(token.raw));
      return { type: 'raw', value: encoded, raw: encoded };
    }
    if (token.type === 'number' && !compatibilityMode) {
      const encoded = encodeNumber(token.value);
      return { type: 'raw', value: encoded, raw: encoded };
    }
    return token;
  });

  const code = renderTokens(tokens, { minify, keepComments }).trim();
  const outputBytes = new TextEncoder().encode(code).byteLength;
  if (outputBytes > MAX_SOURCE_BYTES) throw new Error('OBFUSCATED_LUA_TOO_LARGE');

  return {
    code,
    profile: ADVANCED_V11_PROFILE,
    sourceBytes,
    outputBytes,
    compatibilityMode,
    transforms: {
      strings: true,
      numbers: !compatibilityMode,
      mangleNames: !compatibilityMode,
      controlFlow: false,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      antiDebugging: false,
      minify,
    },
  };
}

export function isAdvancedV11Obfuscated(value) {
  const text = String(value ?? '');
  return /string\.char\(/.test(text) && /function\(/.test(text);
}
