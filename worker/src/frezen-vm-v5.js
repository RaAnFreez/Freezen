import { OBFUSCATION_WATERMARK } from './script-obfuscation-contract.js';

export const FREZEN_VM_V5_PROFILE = Object.freeze({
  version: '5.0',
  mode: 'Frezen Layered VM v5 (manifest sealed)',
  strength: 'VERY_HIGH',
  protectionLevel: 99,
  bytecode: false,
  runtimeVm: true,
  sourceCompatible: true,
  sourceMaterialization: true,
  nativeLoader: true,
  layers: 2,
  integrityLayer: 3,
  algorithm: 'two-stage-affine-payload+record-manifest-seals+dispatcher-seal',
});

export const MAX_VM_V5_SOURCE_BYTES = 3 * 1024 * 1024;
const CHECKSUM_MOD = 65521;
const CHECKSUM_MULTIPLIER = 131;
const CHECKSUM_SEED = 17;
const SAFE_ALPHABET_POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!$%&()*+,-./:;<=>?@[]^_{|}~';

function randomInt(min = 1000, max = 999999999) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomName(prefix = '__frezen_layered') {
  return prefix + randomInt(100000, 999999999);
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createAlphabet() {
  return shuffle([...SAFE_ALPHABET_POOL]).slice(0, 16).join('');
}

function modularInverse256(value) {
  const normalized = ((value % 256) + 256) % 256;
  for (let candidate = 1; candidate < 256; candidate += 2) {
    if ((normalized * candidate) % 256 === 1) return candidate;
  }
  throw new Error('LAYERED_TRANSFORM_UNAVAILABLE');
}

function encodeNibblePayload(bytes) {
  const alphabet = createAlphabet();
  const add = randomInt(1, 251);
  let multiplier = randomInt(3, 255) | 1;
  if (multiplier === 1) multiplier = 3;
  const inverse = modularInverse256(multiplier);
  const step = randomInt(1, 251);
  const roundAdd = randomInt(1, 251);
  const parts = [];

  for (let i = 0; i < bytes.length; i += 1) {
    const mixed = (bytes[i] + add + (((i % 256) * step) % 256)) % 256;
    const transformed = ((mixed * multiplier) + roundAdd) % 256;
    parts.push(alphabet[Math.floor(transformed / 16)], alphabet[transformed % 16]);
  }

  return {
    payload: parts.join(''),
    byteLength: bytes.length,
    add,
    inverse,
    step,
    roundAdd,
    alphabet,
  };
}

function encodeOuterLayer(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const alphabet = createAlphabet();
  const add = randomInt(1, 251);
  let multiplier = randomInt(3, 255) | 1;
  if (multiplier === 1) multiplier = 5;
  const inverse = modularInverse256(multiplier);
  const step = randomInt(1, 251);
  const roundAdd = randomInt(1, 251);
  const parts = [];

  for (let i = 0; i < bytes.length; i += 1) {
    const mixed = (bytes[i] + add + (((i % 256) * step) % 256)) % 256;
    const transformed = ((mixed * multiplier) + roundAdd) % 256;
    parts.push(alphabet[Math.floor(transformed / 16)], alphabet[transformed % 16]);
  }

  return {
    payload: parts.join(''),
    byteLength: bytes.length,
    add,
    inverse,
    step,
    roundAdd,
    alphabet,
  };
}

function splitBytes(bytes, size) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.slice(i, i + size));
  return chunks;
}

function sealNumber(hash, value) {
  let n = Number(value) >>> 0;
  hash = (hash * CHECKSUM_MULTIPLIER + 258) % CHECKSUM_MOD;
  for (let i = 0; i < 4; i += 1) {
    const byte = n % 256;
    hash = (hash * CHECKSUM_MULTIPLIER + byte) % CHECKSUM_MOD;
    n = Math.floor(n / 256);
  }
  return hash;
}

function sealString(hash, value) {
  hash = (hash * CHECKSUM_MULTIPLIER + 256) % CHECKSUM_MOD;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash = (hash * CHECKSUM_MULTIPLIER + byte) % CHECKSUM_MOD;
  }
  return (hash * CHECKSUM_MULTIPLIER + 257) % CHECKSUM_MOD;
}

function sealRecord(item) {
  let hash = sealNumber(17, item.key);
  hash = sealString(hash, item.outer.payload);
  for (const value of [
    item.rawLength,
    item.inner.add,
    item.inner.inverse,
    item.inner.step,
    item.inner.roundAdd,
  ]) hash = sealNumber(hash, value);
  hash = sealString(hash, item.inner.alphabet);
  for (const value of [
    item.outer.byteLength,
    item.outer.add,
    item.outer.inverse,
    item.outer.step,
    item.outer.roundAdd,
  ]) hash = sealNumber(hash, value);
  return sealString(hash, item.outer.alphabet);
}

function sealManifest(instructions) {
  let hash = 17;
  for (const [opcode, operand] of instructions) {
    hash = sealNumber(hash, opcode);
    hash = sealNumber(hash, operand);
  }
  return hash;
}

function sourceIntegrity(bytes) {
  let sum = 0;
  let rolling = CHECKSUM_SEED;
  let lines = 1;
  for (const byte of bytes) {
    sum = (sum + byte) % CHECKSUM_MOD;
    rolling = (rolling * CHECKSUM_MULTIPLIER + byte) % CHECKSUM_MOD;
    if (byte === 10) lines += 1;
  }
  return { sum, rolling, lines };
}

export function compileFrezenVmV5(source, options = {}) {
  const text = String(source ?? '');
  if (!text.trim()) throw new Error('EMPTY_LUA_SOURCE');

  const sourceBytes = Array.from(new TextEncoder().encode(text));
  if (sourceBytes.length > MAX_VM_V5_SOURCE_BYTES) throw new Error('LUA_SOURCE_TOO_LARGE');

  const chunkSize = Math.max(24, Math.min(72, Math.floor(Number(
    options.chunkSize ?? 48,
  )) || 48));
  const chunks = splitBytes(sourceBytes, chunkSize);
  if (!chunks.length) throw new Error('EMPTY_LUA_SOURCE');

  const names = {
    pool: randomName('__f5p'),
    program: randomName('__f5i'),
    decoder: randomName('__f5d'),
    pc: randomName('__f5pc'),
    buffer: randomName('__f5b'),
    instruction: randomName('__f5in'),
    op: randomName('__f5op'),
    source: randomName('__f5src'),
    loader: randomName('__f5load'),
    chunk: randomName('__f5fn'),
    loadError: randomName('__f5le'),
    result: randomName('__f5result'),
    env: randomName('__f5env'),
    ok: randomName('__f5ok'),
    pack: randomName('__f5pack'),
    unpack: randomName('__f5unpack'),
    sum: randomName('__f5sum'),
    rolling: randomName('__f5roll'),
    lineCount: randomName('__f5lines'),
    expectedSum: randomName('__f5expectsum'),
    expectedRolling: randomName('__f5expectroll'),
    expectedLines: randomName('__f5expectlines'),
    expectedLength: randomName('__f5expectlen'),
    index: randomName('__f5idx'),
    high: randomName('__f5hi'),
    low: randomName('__f5lo'),
    value: randomName('__f5value'),
    lookup: randomName('__f5lookup'),
    outerParts: randomName('__f5outer'),
    innerText: randomName('__f5inner'),
    innerParts: randomName('__f5innerparts'),
    rawParts: randomName('__f5raw'),
    byteCount: randomName('__f5bytecount'),
    runtimeType: randomName('__f5type'),
    runtimePcall: randomName('__f5pcall'),
    runtimeError: randomName('__f5error'),
    runtimeSelect: randomName('__f5select'),
    runtimeConcat: randomName('__f5concat'),
    runtimeChar: randomName('__f5char'),
    runtimeByte: randomName('__f5byte'),
    sealByte: randomName('__f5sealbyte'),
    sealNumber: randomName('__f5sealnum'),
    sealString: randomName('__f5sealstr'),
    sealRecord: randomName('__f5sealrec'),
    recordKey: randomName('__f5recordkey'),
    record: randomName('__f5record'),
    manifest: randomName('__f5manifest'),
    expectedManifest: randomName('__f5expectedmanifest'),
    manifestInstruction: randomName('__f5manifestins'),
    manifestIndex: randomName('__f5manifestidx'),
  };

  const usedKeys = new Set();
  const generatedChunks = chunks.map((chunk) => {
    let key;
    do {
      key = randomInt(100000, 999999999);
    } while (usedKeys.has(key));
    usedKeys.add(key);

    const inner = encodeNibblePayload(chunk);
    const outer = encodeOuterLayer(inner.payload);
    return { key, rawLength: chunk.length, inner, outer };
  });

  const opDecode = randomInt(17, 83);
  let opNop = randomInt(91, 139);
  while (opNop === opDecode) opNop = randomInt(91, 139);
  let opExecute = randomInt(151, 223);
  while (opExecute === opDecode || opExecute === opNop) opExecute = randomInt(151, 223);

  for (const item of generatedChunks) item.seal = sealRecord(item);

  const records = shuffle(generatedChunks).map((item) => {
    const values = [
      JSON.stringify(item.outer.payload),
      String(item.rawLength),
      String(item.inner.add),
      String(item.inner.inverse),
      String(item.inner.step),
      String(item.inner.roundAdd),
      JSON.stringify(item.inner.alphabet),
      String(item.outer.byteLength),
      String(item.outer.add),
      String(item.outer.inverse),
      String(item.outer.step),
      String(item.outer.roundAdd),
      JSON.stringify(item.outer.alphabet),
      String(item.seal),
    ];
    return '[' + item.key + ']=' + '{' + values.join(',') + '}';
  });

  const program = [];
  const manifestInstructions = [];
  for (let i = 0; i < generatedChunks.length; i += 1) {
    if (i > 0 && randomInt(0, 4) === 0) {
      program.push('{' + opNop + '}');
      manifestInstructions.push([opNop, -1]);
    }
    program.push('{' + opDecode + ',' + generatedChunks[i].key + '}');
    manifestInstructions.push([opDecode, generatedChunks[i].key]);
  }
  program.push('{' + opNop + '}');
  manifestInstructions.push([opNop, -1]);
  program.push('{' + opExecute + '}');
  manifestInstructions.push([opExecute, -1]);

  const expectedManifest = sealManifest(manifestInstructions);
  const expected = sourceIntegrity(sourceBytes);
  const lines = [
    'local ' + names.pool + '={' + records.join(',') + '}',
    'local ' + names.program + '={' + program.join(',') + '}',
    'local ' + names.expectedLength + '=' + sourceBytes.length,
    'local ' + names.expectedManifest + '=' + expectedManifest,
    'local ' + names.expectedSum + '=' + expected.sum,
    'local ' + names.expectedRolling + '=' + expected.rolling,
    'local ' + names.expectedLines + '=' + expected.lines,
    'local ' + names.sum + '=0',
    'local ' + names.rolling + '=' + CHECKSUM_SEED,
    'local ' + names.lineCount + '=1',
    'local ' + names.runtimeType + '=type',
    'local ' + names.runtimePcall + '=pcall',
    'local ' + names.runtimeError + '=error',
    'local ' + names.runtimeSelect + '=select',
    'local ' + names.runtimeConcat + '=table.concat',
    'local ' + names.runtimeChar + '=string.char',
    'local ' + names.runtimeByte + '=string.byte',
    'local function ' + names.sealByte + '(h,b) return (h*131+b)%65521 end',
    'local function ' + names.sealNumber + '(h,n) h=' + names.sealByte + '(h,258); n=n%4294967296; for i=1,4 do local b=n%256; h=' + names.sealByte + '(h,b); n=(n-b)/256 end; return h end',
    'local function ' + names.sealString + '(h,t) h=' + names.sealByte + '(h,256); for i=1,#t do h=' + names.sealByte + '(h,' + names.runtimeByte + '(t,i)) end; return ' + names.sealByte + '(h,257) end',
    'local function ' + names.sealRecord + '(key,e)',
    'local h=' + names.sealNumber + '(17,key)',
    'h=' + names.sealString + '(h,e[1])',
    'for i=2,6 do h=' + names.sealNumber + '(h,e[i]) end',
    'h=' + names.sealString + '(h,e[7])',
    'for i=8,12 do h=' + names.sealNumber + '(h,e[i]) end',
    'h=' + names.sealString + '(h,e[13])',
    'return h end',
    'for ' + names.recordKey + ',' + names.record + ' in pairs(' + names.pool + ') do if ' + names.runtimeType + '(' + names.record + ')~="table" or ' + names.record + '[14]~=' + names.sealRecord + '(' + names.recordKey + ',' + names.record + ') then ' + names.runtimeError + '("Frezen could not validate this script.",0) end end',
    'local ' + names.manifest + '=17',
    'for ' + names.manifestIndex + '=1,#' + names.program + ' do local ' + names.manifestInstruction + '=' + names.program + '[' + names.manifestIndex + ']; ' + names.manifest + '=' + names.sealNumber + '(' + names.manifest + ',' + names.manifestInstruction + '[1]); ' + names.manifest + '=' + names.sealNumber + '(' + names.manifest + ',' + names.manifestInstruction + '[2] or -1) end',
    'if ' + names.manifest + '~=' + names.expectedManifest + ' then ' + names.runtimeError + '("Frezen could not validate this script.",0) end',
    'local function ' + names.decoder + '(key)',
    'local e=' + names.pool + '[key]',
    'if ' + names.runtimeType + '(e)~="table" then ' + names.runtimeError + '("Frezen could not validate this script.",0) end',
    'local outer=e[1]',
    'if #' + 'outer~=e[8]*2 then ' + names.runtimeError + '("Frezen could not validate this script.",0) end',
    'local ' + names.lookup + '={}',
    'for j=1,#e[13] do ' + names.lookup + '[' + names.runtimeByte + '(e[13],j)]=j-1 end',
    'local ' + names.outerParts + '={}',
    'local ' + names.byteCount + '=0',
    'for j=1,#outer,2 do',
    'local ' + names.high + '=' + names.lookup + '[' + names.runtimeByte + '(outer,j)]',
    'local ' + names.low + '=' + names.lookup + '[' + names.runtimeByte + '(outer,j+1)]',
    'if ' + names.high + '==nil or ' + names.low + '==nil then ' + names.runtimeError + '("Frezen could not validate this script.",0) end',
    'local ' + names.value + '=' + names.high + '*16+' + names.low,
    names.value + '=(' + names.value + '-e[12])%256',
    names.value + '=(' + names.value + '*e[10])%256',
    names.value + '=(' + names.value + '-e[9]-(((' + names.byteCount + '%256)*e[11])%256))%256',
    names.outerParts + '[#' + names.outerParts + '+1]=' + names.runtimeChar + '(' + names.value + ')',
    names.byteCount + '=' + names.byteCount + '+1',
    'end',
    'local ' + names.innerText + '=' + names.runtimeConcat + '(' + names.outerParts + ')',
    'if #' + names.innerText + '~=e[8] then ' + names.runtimeError + '("Frezen could not validate this script.",0) end',
    'local innerMap={}',
    'for j=1,#e[7] do innerMap[' + names.runtimeByte + '(e[7],j)]=j-1 end',
    'local ' + names.innerParts + '={}',
    names.byteCount + '=0',
    'for j=1,#' + names.innerText + ',2 do',
    'local ' + names.high + '=innerMap[' + names.runtimeByte + '(' + names.innerText + ',j)]',
    'local ' + names.low + '=innerMap[' + names.runtimeByte + '(' + names.innerText + ',j+1)]',
    'if ' + names.high + '==nil or ' + names.low + '==nil then ' + names.runtimeError + '("Frezen could not validate this script.",0) end',
    'local ' + names.value + '=' + names.high + '*16+' + names.low,
    names.value + '=(' + names.value + '-e[6])%256',
    names.value + '=(' + names.value + '*e[4])%256',
    names.value + '=(' + names.value + '-e[3]-(((' + names.byteCount + '%256)*e[5])%256))%256',
    'if ' + names.byteCount + '>=e[2] then ' + names.runtimeError + '("Frezen could not validate this script.",0) end',
    names.sum + '=(' + names.sum + '+' + names.value + ')%65521',
    names.rolling + '=(' + names.rolling + '*131+' + names.value + ')%65521',
    'if ' + names.value + '==10 then ' + names.lineCount + '=' + names.lineCount + '+1 end',
    names.innerParts + '[#' + names.innerParts + '+1]=' + names.runtimeChar + '(' + names.value + ')',
    names.byteCount + '=' + names.byteCount + '+1',
    'end',
    'if ' + names.byteCount + '~=e[2] then ' + names.runtimeError + '("Frezen could not validate this script.",0) end',
    'return ' + names.runtimeConcat + '(' + names.innerParts + ')',
    'end',
    'local ' + names.pc + '=1',
    'local ' + names.buffer + '={}',
    'while true do',
    'local ' + names.instruction + '=' + names.program + '[' + names.pc + ']',
    'if not ' + names.instruction + ' then break end',
    'local ' + names.op + '=' + names.instruction + '[1]',
    'if ' + names.op + '==' + opDecode + ' then',
    names.buffer + '[#' + names.buffer + '+1]=' + names.decoder + '(' + names.instruction + '[2])',
    'elseif ' + names.op + '==' + opNop + ' then',
    'elseif ' + names.op + '==' + opExecute + ' then',
    'local ' + names.source + '=' + names.runtimeConcat + '(' + names.buffer + ')',
    'if #' + names.source + '~=' + names.expectedLength + ' or ' + names.sum + '~=' + names.expectedSum + ' or ' + names.rolling + '~=' + names.expectedRolling + ' or ' + names.lineCount + '~=' + names.expectedLines + ' then ' + names.runtimeError + '("Frezen could not validate this script.",0) end',
    'local ' + names.env + '=nil',
    'if ' + names.runtimeType + '(getfenv)=="function" then local envOk,envValue=' + names.runtimePcall + '(function() return getfenv(1) end); if envOk and ' + names.runtimeType + '(envValue)=="table" then ' + names.env + '=envValue end end',
    'if ' + names.env + '==nil then if ' + names.runtimeType + '(_ENV)=="table" then ' + names.env + '=_ENV else ' + names.env + '=_G end end',
    'local ' + names.chunk + ',' + names.loadError + '=nil,nil',
    'if ' + names.runtimeType + '(loadstring)=="function" then',
    names.chunk + ',' + names.loadError + '=loadstring(' + names.source + ')',
    'elseif ' + names.runtimeType + '(load)=="function" then',
    'local loadOk,loadValue,loadMessage=' + names.runtimePcall + '(load,' + names.source + ',"frezen-layered-v5","t",' + names.env + ')',
    'if loadOk and ' + names.runtimeType + '(loadValue)=="function" then ' + names.chunk + ',' + names.loadError + '=loadValue,loadMessage else',
    'local readerUsed=false; local reader=function() if readerUsed then return nil end readerUsed=true; return ' + names.source + ' end',
    'local readerOk,readerValue,readerMessage=' + names.runtimePcall + '(load,reader)',
    'if readerOk then ' + names.chunk + ',' + names.loadError + '=readerValue,readerMessage else ' + names.loadError + '=readerValue end',
    'end',
    'end',
    'if ' + names.runtimeType + '(' + names.chunk + ')~="function" then ' + names.runtimeError + '("Frezen could not initialize the script.",0) end',
    'if ' + names.runtimeType + '(setfenv)=="function" then ' + names.runtimePcall + '(setfenv,' + names.chunk + ',' + names.env + ') end',
    'local ' + names.pack + '=function(...) return {n=' + names.runtimeSelect + '("#",...),...} end',
    'local ' + names.result + '=' + names.pack + '(' + names.runtimePcall + '(' + names.chunk + '))',
    'if not ' + names.result + '[1] then ' + names.runtimeError + '(' + names.result + '[2],0) end',
    'local ' + names.unpack + '=table.unpack or unpack',
    'if ' + names.runtimeType + '(' + names.unpack + ')=="function" then return ' + names.unpack + '(' + names.result + ',2,' + names.result + '.n) end',
    'return ' + names.result + '[2]',
    'end',
    names.pc + '=' + names.pc + '+1',
    'end',
  ];

  const code = OBFUSCATION_WATERMARK + '\n' + lines.join('\n');
  const outputBytes = new TextEncoder().encode(code).byteLength;
  if (outputBytes > MAX_VM_V5_SOURCE_BYTES) throw new Error('OBFUSCATED_LUA_TOO_LARGE');

  return {
    code,
    profile: FREZEN_VM_V5_PROFILE,
    sourceBytes: sourceBytes.length,
    outputBytes,
    chunkCount: chunks.length,
    transforms: {
      payloadLayers: 2,
      integrityLayer: 'per-record-seals+dispatcher-manifest',
      strings: 'two-stage-printable-nibble-payload',
      dispatch: 'per-build-random-opcodes+shuffled-pool+decoy-noops',
      integrity: 'per-record-seal+dispatcher-manifest+byte-length+additive-checksum+rolling-checksum+line-count',
      runtime: 'native-lua-loader-for-source-compatibility',
      sourceMaterialization: true,
      antiDebugging: false,
    },
  };
}

export function isFrezenVmV5(value) {
  const text = String(value ?? '');
  return text.startsWith(OBFUSCATION_WATERMARK)
    && text.includes('Frezen could not validate this script.')
    && text.includes('frezen-layered-v5');
}
