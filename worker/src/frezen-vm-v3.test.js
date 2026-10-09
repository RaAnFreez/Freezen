import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileFrezenVmV3, FREZEN_VM_V3_LUA_VERSION, FREZEN_VM_V3_PROFILE, isFrezenVmV3 } from './frezen-vm-v3.js';
import { OBFUSCATION_WATERMARK } from './script-obfuscation-contract.js';

describe('Frezen VM v3', () => {
  it('builds a source-free virtual instruction payload', () => {
    const source = [
      'local secret = "FREZEN_SOURCE_SHOULD_NOT_APPEAR"',
      'local function add(a,b)',
      '  return a + b',
      'end',
      'local t = { value = add(7, 5) }',
      'print(t.value)',
    ].join('\n');

    const result = compileFrezenVmV3(source);

    expect(FREZEN_VM_V3_PROFILE.version).toBe('3.0');
    expect(FREZEN_VM_V3_PROFILE.sourceMaterialization).toBe(false);
    expect(FREZEN_VM_V3_PROFILE.loadstring).toBe(false);
    expect(result.code.startsWith(OBFUSCATION_WATERMARK + '\n')).toBe(true);
    expect(result.code).not.toContain('FREZEN_SOURCE_SHOULD_NOT_APPEAR');
    expect(result.code).not.toContain('local secret');
    expect(result.code).not.toContain('loadstring');
    expect(result.code).toContain('FREZEN_VM_V3_BAD_EXPR');
    expect(isFrezenVmV3(result.code)).toBe(true);
  });

  it('supports function-valued local initializers', () => {
    const result = compileFrezenVmV3([
      'local fn = function(a)',
      '  return a + 1',
      'end',
      'print(fn(4))',
    ].join('\n'));
    expect(result.code).toContain('FREZEN_VM_V3_BAD_EXPR');
    expect(result.code).not.toContain('VM_V3_UNSUPPORTED_EXPRESSION:FunctionDeclaration');
  });

  it('supports Lua 5.1 table-call expressions', () => {
    const result = compileFrezenVmV3([
      'local function use(t)',
      '  return t.value',
      'end',
      'local x = use { value = 7 }',
      'print(x)',
    ].join('\n'));
    expect(result.code).toContain('FREZEN_VM_V3_BAD_EXPR');
    expect(result.code).not.toContain('VM_V3_COMPILE_FAILED:(node.arguments || []).map is not a function');
  });

  it('supports Lua 5.1 numeric for statements', () => {
    const result = compileFrezenVmV3([
      'local total = 0',
      'for i = 1, 3 do',
      '  total = total + i',
      'end',
      'print(total)',
    ].join('\n'));
    expect(result.code).toContain('FREZEN_VM_V3_BAD_EXPR');
    expect(result.code).not.toContain('VM_V3_UNSUPPORTED_STATEMENT:ForNumericStatement');
  });

  it('supports Luau compound assignments with Lua 5.1 parsing', () => {
    const result = compileFrezenVmV3([
      'local total = 1',
      'total += 2',
      'total *= 3',
      'local data = { value = 4 }',
      'data.value += total',
      'local index = "value"',
      'data[index] += 1',
      'data.value //= 2',
      'print(total, data.value)',
    ].join('\n'));
    expect(result.code).toContain('FREZEN_VM_V3_BAD_EXPR');
    expect(result.code).not.toContain('VM_V3_PARSE_FAILED:');
    expect(result.code).toContain('math.floor');
  });

  it('randomizes virtual opcode identifiers for each compiled artifact', () => {
    const source = [
      'local value = 3',
      'if value > 1 then',
      '  value = value + 4',
      'end',
      'print(value)',
    ].join('\n');

    const first = compileFrezenVmV3(source);
    const second = compileFrezenVmV3(source);
    const readOpcodeIds = (code) =>
      Array.from(code.matchAll(/if (?:x\[1\]|op)==(\d+)/g), (match) => Number(match[1]));
    const firstIds = readOpcodeIds(first.code);
    const secondIds = readOpcodeIds(second.code);

    expect(firstIds.length).toBeGreaterThan(15);
    expect(new Set(firstIds).size).toBe(firstIds.length);
    expect(firstIds.every((id) => id >= 257 && id <= 65535)).toBe(true);
    expect(firstIds).not.toEqual(secondIds);
    expect(first.profile.algorithm).toContain('per-build-opcode-map');
  });

  it('randomizes the constant pool and substitution alphabet per build', () => {
    const source = [
      'local message = "FREZEN_POOL_SECRET"',
      'local value = 17',
      'local data = { alpha = message, beta = value }',
      'local function add(a, b)',
      '  return a + b',
      'end',
      'print(add(data.beta, 3), data.alpha)',
    ].join('\n');

    const first = compileFrezenVmV3(source);
    const second = compileFrezenVmV3(source);
    const readAlphabet = (code) => code.match(
      /local function dg\(z\) for q=1,#"([^"]+)" do if string\.byte\("([^"]+)",q\)==z then return q-1 end end error/
    );
    const firstAlphabet = readAlphabet(first.code);
    const secondAlphabet = readAlphabet(second.code);

    expect(first.transforms.constantPool).toBe('per-build-shuffled-index-map');
    expect(first.transforms.strings).toContain('per-build-substitution-alphabet');
    expect(firstAlphabet).toBeTruthy();
    expect(secondAlphabet).toBeTruthy();
    expect(firstAlphabet[1]).toBe(firstAlphabet[2]);
    expect(secondAlphabet[1]).toBe(secondAlphabet[2]);
    expect(new Set(firstAlphabet[1]).size).toBe(firstAlphabet[1].length);
    expect(firstAlphabet[1]).not.toBe(secondAlphabet[1]);
    expect(first.code).not.toContain('FREZEN_POOL_SECRET');
  });


  it('uses the Lua 5.1 source grammar for obfuscation input', () => {
    expect(FREZEN_VM_V3_LUA_VERSION).toBe('5.1');
    expect(() => compileFrezenVmV3('local x = 7 // 2')).toThrow(/VM_V3_PARSE_FAILED:/);
    expect(() => compileFrezenVmV3('local x = 1 & 2')).toThrow(/VM_V3_PARSE_FAILED:/);
    expect(() => compileFrezenVmV3('goto nope\n::nope::')).toThrow(/VM_V3_PARSE_FAILED:/);
  });

  it('accepts Unicode in quoted and long-bracket string literals', () => {
    const result = compileFrezenVmV3([
      'local quoted = "infinity ∞ café 🎵"',
      'local long = [=[long unicode ∞ 🎵]=]',
      'print(quoted, long)',
    ].join('\n'));

    expect(result.code).not.toContain('VM_V3_PARSE_FAILED:');
    expect(result.code).not.toContain('__FREZEN_UTF8_');
    expect(result.code).not.toContain('infinity ∞');
    expect(result.code).toContain('FREZEN_VM_V3_BAD_EXPR');
  });

  it('captures the payload execution environment for global lookup', () => {
    const result = compileFrezenVmV3('print(type(print))');
    expect(result.code).toContain('getfenv');
    expect(result.code).toContain('FREZEN_VM_V3_CALL_NONFUNCTION:nil');
  });

  it('emits callable-friendly runtime dispatch', () => {
    const result = compileFrezenVmV3('print(type(print))');
    expect(result.code).toContain('FREZEN_VM_V3_CALL_NONFUNCTION:nil');
    expect(result.code).toContain('getfenv');
  });

  it('executes core Lua semantics in the Luau integration runtime', () => {
    const runtime = process.env.FREZEN_LUA_RUNTIME;
    if (!runtime) return;

    const source = [
      'local secret = "FREZEN_SECRET_RUNTIME_ONLY"',
      'local function add(a,b)',
      '  return a + b',
      'end',
      'local total = add(7, 5)',
      'print(total)',
      'local t = { value = total }',
      'print(t.value)',
      'print "string-call-ok"',
      'local receiver = { value = 4, add = function(self, x) return self.value + x end }',
      'print(receiver:add(3))',
      'print("unicode ∞ café 🎵")',
      'local unicodeLong = [=[long unicode ∞ 🎵]=]',
      'print(unicodeLong)',
    ].join('\n');

    const result = compileFrezenVmV3(source);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frezen-vm-v3-'));
    const file = path.join(dir, 'payload.lua');
    fs.writeFileSync(file, result.code, 'utf8');

    const run = spawnSync(runtime, [file], { encoding: 'utf8', timeout: 15000 });
    try {
      if (run.status !== 0) {
        throw new Error([`status=${run.status}`, `stdout=${run.stdout}`, `stderr=${run.stderr}`].join('\\n'));
      }
      expect(run.stdout.trim().split(/\r?\n/)).toEqual(['12', '12', 'string-call-ok', '7', 'unicode ∞ café 🎵', 'long unicode ∞ 🎵']);
      expect(run.stdout).not.toContain('FREZEN_SECRET_RUNTIME_ONLY');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('resolves globals through the payload function environment', () => {
    const runtime = process.env.FREZEN_LUA_RUNTIME;
    if (!runtime) return;

    const result = compileFrezenVmV3('print("resolved-from-payload-env")');
    const wrapper = [
      'local nativePrint = print',
      '_G.print = nil',
      'local payload = function()',
      result.code,
      'end',
      'setfenv(payload, setmetatable({}, { __index = function(_, name)',
      '  if name == "print" then return nativePrint end',
      '  return _G[name]',
      'end }))',
      'payload()',
      '_G.print = nativePrint',
    ].join('\n');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frezen-vm-v3-env-'));
    const file = path.join(dir, 'payload-env.lua');
    fs.writeFileSync(file, wrapper, 'utf8');

    try {
      const run = spawnSync(runtime, [file], { encoding: 'utf8', timeout: 15000 });
      if (run.status !== 0) {
        throw new Error(['status=' + run.status, 'stdout=' + run.stdout, 'stderr=' + run.stderr].join('\\n'));
      }
      expect(run.stdout.trim()).toBe('resolved-from-payload-env');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

});
