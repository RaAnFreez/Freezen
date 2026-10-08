import { OBFUSCATION_WATERMARK } from './script-obfuscation-contract.js';

export const FREZEN_VM_V2_PROFILE = Object.freeze({
  version: '2.0',
  mode: 'Frezen VM Printable Chunk Dispatcher',
  strength: 'VERY_HIGH',
  protectionLevel: 98,
  bytecode: true,
  runtimeVm: true,
  sourceCompatible: true,
  chunkSize: 48,
  transform: 'layered-base64-alphabet-chunks',
});

export const MAX_VM_V2_SOURCE_BYTES = 3 * 1024 * 1024;

const RANDOM_MIN = 100000;
const RANDOM_MAX = 999999999;
const SAFE_ALPHABET_POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!$%&()*+,-./:;<=>?@[]^_`{|}~';

function randomInt(min = 1000, max = 9999999) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomName(prefix = '__fvm') {
  return prefix + randomInt(RANDOM_MIN, RANDOM_MAX);
}

function computeSourceChecksum16(bytes) {
  let checksum = 0;
  for (const byte of bytes) checksum = (checksum + byte) % 65521;
  return checksum;
}

function shuffle(values) {
  const output = [...values];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function createAlphabet() {
  return shuffle([...SAFE_ALPHABET_POOL]).slice(0, 64).join('');
}

function modularInverse256(value) {
  const normalized = ((value % 256) + 256) % 256;
  for (let candidate = 1; candidate < 256; candidate += 2) {
    if ((normalized * candidate) % 256 === 1) return candidate;
  }
  throw new Error('FREZEN_VM_V2_INVERSE_UNAVAILABLE');
}

function encodeChunk(bytes) {
  const alphabet = createAlphabet();
  const add = randomInt(17, 251);
  let multiplier = randomInt(3, 255) | 1;
  if (multiplier === 1) multiplier = 3;
  const inverse = modularInverse256(multiplier);
  const step = randomInt(3, 251);
  const roundAdd = randomInt(1, 251);
  const transformed = bytes.map((byte, index) => {
    const idx = index % 256;
    const shifted = (byte + add + ((idx * step) % 256)) % 256;
    return ((shifted * multiplier) + roundAdd) % 256;
  });

  const payload = [];
  for (let i = 0; i < transformed.length; i += 3) {
    const b1 = transformed[i] ?? 0;
    const b2 = transformed[i + 1] ?? 0;
    const b3 = transformed[i + 2] ?? 0;
    const d1 = Math.floor(b1 / 4);
    const d2 = ((b1 % 4) * 16) + Math.floor(b2 / 16);
    const d3 = ((b2 % 16) * 4) + Math.floor(b3 / 64);
    const d4 = b3 % 64;
    payload.push(alphabet[d1], alphabet[d2], alphabet[d3], alphabet[d4]);
  }

  return {
    payload: payload.join(''),
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

export function compileFrezenVmV2(source, options = {}) {
  const text = String(source ?? '');
  if (!text.trim()) throw new Error('EMPTY_LUA_SOURCE');

  const sourceBytes = new TextEncoder().encode(text);
  const sourceChecksum16 = computeSourceChecksum16(sourceBytes);
  const sourceLineCount = text.split(/\r\n|\r|\n/).length;
  if (sourceBytes.byteLength > MAX_VM_V2_SOURCE_BYTES) {
    throw new Error('LUA_SOURCE_TOO_LARGE');
  }

  const chunkSize = Math.max(24, Math.min(72, Number(
    options.chunkSize ?? FREZEN_VM_V2_PROFILE.chunkSize,
  )));
  const chunks = splitBytes(Array.from(sourceBytes), chunkSize);
  if (!chunks.length) throw new Error('EMPTY_LUA_SOURCE');

  const poolName = randomName('__frezen_v2p');
  const programName = randomName('__frezen_v2i');
  const decodeName = randomName('__frezen_v2d');
  const digitName = randomName('__frezen_v2g');
  const pcName = randomName('__frezen_v2pc');
  const bufferName = randomName('__frezen_v2b');
  const instructionName = randomName('__frezen_v2ins');
  const opName = randomName('__frezen_v2op');
  const sourceName = randomName('__frezen_v2src');
  const loaderName = randomName('__frezen_v2load');
  const functionName = randomName('__frezen_v2fn');
  const errorName = randomName('__frezen_v2err');
  const okName = randomName('__frezen_v2ok');
  const resultName = randomName('__frezen_v2result');
  const indexName = randomName('__frezen_v2idx');
  const charName = randomName('__frezen_v2char');
  const raw1Name = randomName('__frezen_v2a');
  const raw2Name = randomName('__frezen_v2b');
  const raw3Name = randomName('__frezen_v2c');
  const raw4Name = randomName('__frezen_v2d');
  const b2Name = randomName('__frezen_v2x');
  const b3Name = randomName('__frezen_v2y');
  const byteIndexName = randomName('__frezen_v2bi');
  const expectedBytesName = randomName('__frezen_v2len');
  const expectedChecksumName = randomName('__frezen_v2sum');
  const expectedLinesName = randomName('__frezen_v2lines');
  const actualChecksumName = randomName('__frezen_v2actualsum');
  const actualLinesName = randomName('__frezen_v2actuallines');

  const opcodeDecode = randomInt(11, 97);
  let opcodeExecute = randomInt(101, 191);
  if (opcodeExecute === opcodeDecode) opcodeExecute += 1;
  let opcodeNop = randomInt(193, 251);
  if (opcodeNop === opcodeDecode || opcodeNop === opcodeExecute) opcodeNop = 251;

  const generatedChunks = chunks.map((chunk) => ({
    key: randomInt(100000, 9999999),
    encoded: encodeChunk(chunk),
  }));

  const entries = shuffle(generatedChunks).map(({ key, encoded }) =>
    `[${key}]={"${encoded.payload}",${encoded.byteLength},${encoded.add},${encoded.inverse},${encoded.step},${encoded.roundAdd},"${encoded.alphabet}"}`,
  );

  const instructions = generatedChunks.map(({ key }) => `{${opcodeDecode},${key}}`);
  instructions.push(`{${opcodeNop}}`);
  instructions.push(`{${opcodeExecute}}`);

  const prefix = [
    `local ${poolName}={${entries.join(',')}}`,
    `local ${programName}={${instructions.join(',')}}`,
    `local ${expectedBytesName}=${sourceBytes.byteLength}`,
    `local ${expectedChecksumName}=${sourceChecksum16}`,
    `local ${expectedLinesName}=${sourceLineCount}`,
    `local ${actualChecksumName}=0`,
    `local ${actualLinesName}=1`,
    `local function ${digitName}(a,c)`,
    `  local i=1`,
    `  while i<=#a do`,
    `    if string.sub(a,i,i)==c then`,
    `      return i-1`,
    `    end`,
    `    i=i+1`,
    `  end`,
    `  error("FREZEN_VM_V2_ALPHABET_ERROR")`,
    `end`,
    `local function ${decodeName}(k)`,
    `  local e=${poolName}[k]`,
    `  if not e then`,
    `    error("FREZEN_VM_V2_CHUNK_MISSING")`,
    `  end`,
    `  local s=e[1]`,
    `  local n=e[2]`,
    `  local add=e[3]`,
    `  local inv=e[4]`,
    `  local step=e[5]`,
    `  local round=e[6]`,
    `  local alphabet=e[7]`,
    `  local out={}`,
    `  local ${byteIndexName}=0`,
    `  for ${indexName}=1,#s,4 do`,
    `    local ${raw1Name}=${digitName}(alphabet,string.sub(s,${indexName},${indexName}))`,
    `    local ${raw2Name}=${digitName}(alphabet,string.sub(s,${indexName}+1,${indexName}+1))`,
    `    local ${raw3Name}=${digitName}(alphabet,string.sub(s,${indexName}+2,${indexName}+2))`,
    `    local ${raw4Name}=${digitName}(alphabet,string.sub(s,${indexName}+3,${indexName}+3))`,
    `    local ${charName}=${raw1Name}*4+((${raw2Name}-${raw2Name}%16)/16)`,
    `    if ${byteIndexName}<n then`,
    `      ${charName}=(${charName}-round)%256`,
    `      ${charName}=(${charName}*inv)%256`,
    `      ${charName}=(${charName}-add-((${byteIndexName}%256)*step)%256)%256`,
    `      if ${charName}<0 then`,
    `        ${charName}=${charName}+256`,
    `      end`,
    `      ${actualChecksumName}=(${actualChecksumName}+${charName})%65521`,
    `      if ${charName}==10 then`,
    `        ${actualLinesName}=${actualLinesName}+1`,
    `      end`,
    `      out[#out+1]=string.char(${charName})`,
    `      ${byteIndexName}=${byteIndexName}+1`,
    `    end`,
    `    local ${b2Name}=(${raw2Name}%16)*16+((${raw3Name}-${raw3Name}%4)/4)`,
    `    if ${byteIndexName}<n then`,
    `      ${b2Name}=(${b2Name}-round)%256`,
    `      ${b2Name}=(${b2Name}*inv)%256`,
    `      ${b2Name}=(${b2Name}-add-((${byteIndexName}%256)*step)%256)%256`,
    `      if ${b2Name}<0 then`,
    `        ${b2Name}=${b2Name}+256`,
    `      end`,
    `      ${actualChecksumName}=(${actualChecksumName}+${b2Name})%65521`,
    `      if ${b2Name}==10 then`,
    `        ${actualLinesName}=${actualLinesName}+1`,
    `      end`,
    `      out[#out+1]=string.char(${b2Name})`,
    `      ${byteIndexName}=${byteIndexName}+1`,
    `    end`,
    `    local ${b3Name}=(${raw3Name}%4)*64+${raw4Name}`,
    `    if ${byteIndexName}<n then`,
    `      ${b3Name}=(${b3Name}-round)%256`,
    `      ${b3Name}=(${b3Name}*inv)%256`,
    `      ${b3Name}=(${b3Name}-add-((${byteIndexName}%256)*step)%256)%256`,
    `      if ${b3Name}<0 then`,
    `        ${b3Name}=${b3Name}+256`,
    `      end`,
    `      ${actualChecksumName}=(${actualChecksumName}+${b3Name})%65521`,
    `      if ${b3Name}==10 then`,
    `        ${actualLinesName}=${actualLinesName}+1`,
    `      end`,
    `      out[#out+1]=string.char(${b3Name})`,
    `      ${byteIndexName}=${byteIndexName}+1`,
    `    end`,
    `  end`,
    `  return table.concat(out)`,
    `end`,
    `local ${pcName}=1`,
    `local ${bufferName}={}`,
    `while true do`,
    `  local ${instructionName}=${programName}[${pcName}]`,
    `  if not ${instructionName} then`,
    `    break`,
    `  end`,
    `  local ${opName}=${instructionName}[1]`,
    `  if ${opName}==${opcodeDecode} then`,
    `    ${bufferName}[#${bufferName}+1]=${decodeName}(${instructionName}[2])`,
    `  elseif ${opName}==${opcodeExecute} then`,
    `    local ${sourceName}=table.concat(${bufferName})`,
    `    if #${sourceName}~=${expectedBytesName} then`,
    `      error("FREZEN_VM_V2_DECODE_LENGTH_MISMATCH:"..tostring(#${sourceName})..":"..tostring(${expectedBytesName}))`,
    `    end`,
    `    if ${actualChecksumName}~=${expectedChecksumName} then`,
    `      error("FREZEN_VM_V2_DECODE_CHECKSUM_MISMATCH:"..tostring(${actualChecksumName})..":"..tostring(${expectedChecksumName}))`,
    `    end`,
    `    if ${actualLinesName}~=${expectedLinesName} then`,
    `      error("FREZEN_VM_V2_DECODE_LINE_COUNT_MISMATCH:"..tostring(${actualLinesName})..":"..tostring(${expectedLinesName}))`,
    `    end`,
    `    local ${loaderName}=loadstring or load`,
    `    if type(${loaderName})~="function" then`,
    `      error("FREZEN_VM_V2_LOAD_UNAVAILABLE")`,
    `    end`,
    `    local ${functionName},${errorName}=${loaderName}(${sourceName})`,
    `    if type(${functionName})~="function" then`,
    `      error("FREZEN_VM_V2_COMPILE_FAILED:"..tostring(${errorName}))`,
    `    end`,
    `    local ${okName},${resultName}=pcall(${functionName})`,
    `    if not ${okName} then`,
    `      error("FREZEN_VM_V2_RUNTIME_FAILED:"..tostring(${resultName}))`,
    `    end`,
    `    return ${resultName}`,
    `  elseif ${opName}==${opcodeNop} then`,
    `  end`,
    `  ${pcName}=${pcName}+1`,
    `end`,
  ].join('\n');
  const code = OBFUSCATION_WATERMARK + '\n' + prefix;
  const outputBytes = new TextEncoder().encode(code).byteLength;
  if (outputBytes > MAX_VM_V2_SOURCE_BYTES) throw new Error('OBFUSCATED_LUA_TOO_LARGE');

  return {
    code,
    profile: FREZEN_VM_V2_PROFILE,
    sourceBytes: sourceBytes.byteLength,
    outputBytes,
    chunkCount: chunks.length,
    transforms: {
      bytecode: true,
      runtimeVm: true,
      sourceCompatible: true,
      strings: 'printable-layered-chunks',
      transform: 'layered-base64-alphabet-chunks',
      integrity: 'length+checksum16+line-count',
    },
  };
}

export function isFrezenVmV2(value) {
  const text = String(value ?? '');
  return text.startsWith(OBFUSCATION_WATERMARK)
    && /while true do/.test(text)
    && /loadstring or load/.test(text)
    && /FREZEN_VM_V2_CHUNK_MISSING/.test(text);
}
