import { OBFUSCATION_WATERMARK } from './script-obfuscation-contract.js';

export const FREZEN_VM_PROFILE = Object.freeze({
  version: '1.0',
  mode: 'Frezen VM Chunk Dispatcher',
  strength: 'VERY_HIGH',
  protectionLevel: 100,
  bytecode: true,
  runtimeVm: true,
  sourceCompatible: true,
  chunkSize: 48,
  transform: 'double-affine-bytecode-chunks',
});

export const MAX_VM_SOURCE_BYTES = 3 * 1024 * 1024;
const CHECKSUM_MOD = 4294967291;

function sourceChecksum(bytes) {
  let hash = 2166136261;
  for (const byte of bytes) hash = (hash * 16777619 + byte) % CHECKSUM_MOD;
  return hash;
}

function randomInt(min = 1000, max = 9999999) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomName(prefix = '__fvm') {
  return prefix + randomInt(100000, 999999999);
}

function modularInverse256(value) {
  const normalized = ((value % 256) + 256) % 256;
  for (let candidate = 1; candidate < 256; candidate += 2) {
    if ((normalized * candidate) % 256 === 1) return candidate;
  }
  throw new Error('FREZEN_VM_INVERSE_UNAVAILABLE');
}


function encodeChunk(bytes) {
  const add = randomInt(17, 251);
  let multiplier = randomInt(3, 255) | 1;
  if (multiplier === 1) multiplier = 3;
  const inverse = modularInverse256(multiplier);
  const indexMul = randomInt(3, 251);
  const indexAdd = randomInt(1, 251);
  const encoded = bytes.map((byte, index) => {
    const idx = index % 256;
    const mixed = (byte + add + ((idx * indexMul) % 256)) % 256;
    return ((mixed * multiplier) + ((idx * indexAdd) % 256)) % 256;
  });
  return {
    payload: encoded,
    add,
    inverse,
    indexMul,
    indexAdd,
  };
}

function splitBytes(bytes, size) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.slice(i, i + size));
  return chunks;
}

export function compileFrezenVm(source, options = {}) {
  const text = String(source ?? '');
  if (!text.trim()) throw new Error('EMPTY_LUA_SOURCE');

  const sourceBytes = new TextEncoder().encode(text);
  if (sourceBytes.byteLength > MAX_VM_SOURCE_BYTES) throw new Error('LUA_SOURCE_TOO_LARGE');

  const chunkSize = Math.max(16, Math.min(96, Number(options.chunkSize ?? FREZEN_VM_PROFILE.chunkSize)));
  const chunks = splitBytes(Array.from(sourceBytes), chunkSize);
  if (!chunks.length) throw new Error('EMPTY_LUA_SOURCE');

  const poolName = randomName('__frezen_vp');
  const programName = randomName('__frezen_vi');
  const decodeName = randomName('__frezen_vd');
  const pcName = randomName('__frezen_pc');
  const bufferName = randomName('__frezen_vb');
  const instructionName = randomName('__frezen_ins');
  const opName = randomName('__frezen_op');
  const sourceName = randomName('__frezen_src');
  const loaderName = randomName('__frezen_load');
  const functionName = randomName('__frezen_fn');
  const errorName = randomName('__frezen_err');
  const okName = randomName('__frezen_ok');
  const resultName = randomName('__frezen_result');
  const valueName = randomName('__frezen_value');
  const byteName = randomName('__frezen_byte');
  const indexName = randomName('__frezen_idx');

  const opcodeDecode = randomInt(11, 97);
  let opcodeExecute = randomInt(101, 191);
  if (opcodeExecute === opcodeDecode) opcodeExecute += 1;
  let opcodeNop = randomInt(193, 251);
  if (opcodeNop === opcodeDecode || opcodeNop === opcodeExecute) opcodeNop = 251;

  const entries = [];
  const instructions = [];
  for (const chunk of chunks) {
    const key = randomInt(100000, 9999999);
    const encoded = encodeChunk(chunk);
    entries.push(
      `[${key}]={${encoded.payload.join(',')},${encoded.payload.length},${encoded.add},${encoded.inverse},${encoded.indexMul},${encoded.indexAdd}}`,
    );
    instructions.push(`{${opcodeDecode},${key}}`);
  }
  instructions.push(`{${opcodeNop}}`);
  instructions.push(`{${opcodeExecute}}`);

  const prefix = [
    `local ${poolName}={${entries.join(',')}}`,
    `local ${programName}={${instructions.join(',')}}`,
    `local ${decodeName}=function(k)local e=${poolName}[k] if not e then error("FREZEN_VM_CHUNK_MISSING") end local n=e[#e-4] local add=e[#e-3] local inv=e[#e-2] local im=e[#e-1] local ia=e[#e] local out={} for ${indexName}=1,n do local ${byteName}=e[${indexName}] local ${valueName}=(${byteName}-((((${indexName}-1)%256)*ia)%256))%256 ${valueName}=(${valueName}*inv)%256 ${valueName}=(${valueName}-add-((((${indexName}-1)%256)*im)%256))%256 out[${indexName}]=string.char(${valueName}) end return table.concat(out) end`,
    `local ${pcName}=1 local ${bufferName}={}`,
    `while true do local ${instructionName}=${programName}[${pcName}] if not ${instructionName} then break end local ${opName}=${instructionName}[1] if ${opName}==${opcodeDecode} then ${bufferName}[#${bufferName}+1]=${decodeName}(${instructionName}[2]) elseif ${opName}==${opcodeExecute} then local ${sourceName}=table.concat(${bufferName}) local ${loaderName}=loadstring or load if type(${loaderName})~="function" then error("FREZEN_VM_LOAD_UNAVAILABLE") end local ${functionName},${errorName}=${loaderName}(${sourceName}) if type(${functionName})~="function" then error("FREZEN_VM_COMPILE_FAILED:"..tostring(${errorName})) end local ${okName},${resultName}=pcall(${functionName}) if not ${okName} then error("FREZEN_VM_RUNTIME_FAILED:"..tostring(${resultName})) end return ${resultName} elseif ${opName}==${opcodeNop} then end ${pcName}=${pcName}+1 end`,
  ].join('\n');

  const expectedLength = sourceBytes.byteLength;
  const expectedChecksum = sourceChecksum(Array.from(sourceBytes));
  const integrity = `local ${randomName('__frezen_len')}=${expectedLength} local ${randomName('__frezen_sum')}=${expectedChecksum}`;
  const code = `${OBFUSCATION_WATERMARK}\n${prefix}`;
  const outputBytes = new TextEncoder().encode(code).byteLength;
  if (outputBytes > MAX_VM_SOURCE_BYTES) throw new Error('OBFUSCATED_LUA_TOO_LARGE');

  return {
    code,
    profile: FREZEN_VM_PROFILE,
    sourceBytes: sourceBytes.byteLength,
    outputBytes,
    chunkCount: chunks.length,
    transforms: {
      bytecode: true,
      runtimeVm: true,
      sourceCompatible: true,
      strings: 'chunked-numeric-bytes',
      transform: 'double-affine-bytecode-chunks',
    },
  };
}

export function isFrezenVm(value) {
  const text = String(value ?? '');
  return text.startsWith(OBFUSCATION_WATERMARK)
    && /while true do/.test(text)
    && /loadstring or load/.test(text)
    && /string\.char/.test(text)
    && /table\.concat/.test(text);
}
