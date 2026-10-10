import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  compileFrezenVmV4,
  FREZEN_VM_V4_PROFILE,
  isFrezenVmV4,
} from './frezen-vm-v4.js';
import { OBFUSCATION_WATERMARK } from './script-obfuscation-contract.js';

function runLua(runtime, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frezen-layered-v4-'));
  const file = path.join(dir, 'payload.lua');
  fs.writeFileSync(file, source, 'utf8');
  try {
    const result = spawnSync(runtime, [file], {
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error([
        'status=' + result.status,
        'stdout=' + result.stdout,
        'stderr=' + result.stderr,
      ].join('\n'));
    }
    return result.stdout;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('Frezen Layered VM v4', () => {
  it('uses two payload layers without embedding plain source', () => {
    const source = [
      'local secret = "FREZEN_V4_SOURCE_MUST_NOT_APPEAR"',
      'local function add(a, b) return a + b end',
      'print(add(7, 5))',
    ].join('\n');
    const result = compileFrezenVmV4(source);

    expect(FREZEN_VM_V4_PROFILE.version).toBe('4.0');
    expect(FREZEN_VM_V4_PROFILE.layers).toBe(2);
    expect(FREZEN_VM_V4_PROFILE.sourceMaterialization).toBe(true);
    expect(result.transforms.payloadLayers).toBe(2);
    expect(result.transforms.integrity).toContain('rolling-checksum');
    expect(result.code.startsWith(OBFUSCATION_WATERMARK + '\n')).toBe(true);
    expect(result.code.split(/\r?\n/)).toHaveLength(2);
    expect(result.code.split(OBFUSCATION_WATERMARK).length - 1).toBe(1);
    expect(result.code).not.toContain('FREZEN_V4_SOURCE_MUST_NOT_APPEAR');
    expect(result.code).not.toContain('local secret');
    expect(result.code).toContain('Frezen could not validate this script.');
    expect(result.code).toContain('loadstring');
    expect(isFrezenVmV4(result.code)).toBe(true);
  });

  it('randomizes dispatch opcodes and pool order for each build', () => {
    const source = 'local value = 3\nprint(value + 4)';
    const first = compileFrezenVmV4(source);
    const second = compileFrezenVmV4(source);
    const readOpcodes = (code) => Array.from(
      code.matchAll(/__f4op\d+==(\d+) then/g),
      (match) => Number(match[1]),
    );

    const firstOpcodes = readOpcodes(first.code);
    const secondOpcodes = readOpcodes(second.code);
    expect(firstOpcodes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(firstOpcodes).size).toBe(firstOpcodes.length);
    expect(firstOpcodes).not.toEqual(secondOpcodes);
    expect(first.code).not.toBe(second.code);
  });

  it('uses larger chunks to keep generated payload overhead down', () => {
    const source = 'local value=1\n'.repeat(3000);
    const result = compileFrezenVmV4(source);
    expect(result.chunkCount).toBeLessThanOrEqual(50);
    expect(result.outputBytes).toBeLessThan(500_000);
  });

  it('rejects empty and oversized source', () => {
    expect(() => compileFrezenVmV4(' \n  ')).toThrow('EMPTY_LUA_SOURCE');
    expect(() => compileFrezenVmV4('x'.repeat(3 * 1024 * 1024 + 1))).toThrow('LUA_SOURCE_TOO_LARGE');
  });

  it('executes loops, functions, varargs, nil arguments, methods, and Unicode in Luau', () => {
    const runtime = process.env.FREZEN_LUA_RUNTIME;
    if (!runtime) return;

    const source = [
      'local total = 0',
      'for i = 1, 4 do total = total + i end',
      'local function count(...) return select("#", ...) end',
      'local function verify(first, middle, last) return first == nil and middle == "kept" and last == nil end',
      'local receiver = { value = 4, add = function(self, x) return self.value + x end }',
      'local function values(...) return ... end',
      'local a, b, c = values("a", nil, "c")',
      'print(total)',
      'print(count("head", "middle", nil))',
      'print(verify(nil, "kept", nil))',
      'print(receiver:add(3))',
      'print("unicode ∞ café 🎵")',
      'print(a, b == nil, c)',
    ].join('\n');

    const result = compileFrezenVmV4(source);
    const stdout = runLua(runtime, result.code);
    expect(stdout.trim().split(/\r?\n/)).toEqual([
      '10',
      '3',
      'true',
      '7',
      'unicode ∞ café 🎵',
      'a\ttrue\tc',
    ]);
  });

  it('supports Lua 5.1-style reader-only load when loadstring is unavailable', () => {
    const runtime = process.env.FREZEN_LUA_RUNTIME;
    if (!runtime) return;

    const generated = compileFrezenVmV4('print("reader loader fallback ok")').code;
    const wrapper = [
      'local nativeCompile = loadstring or function(source) return load(source) end',
      'local function readerOnlyLoad(reader)',
      '  if type(reader) ~= "function" then error("reader function required") end',
      '  local parts = {}',
      '  while true do local part = reader(); if part == nil then break end; parts[#parts + 1] = part end',
      '  return nativeCompile(table.concat(parts))',
      'end',
      'local captured = {}',
      'local payload = function()',
      generated,
      'end',
      'local env = setmetatable({',
      '  load = readerOnlyLoad,',
      '  print = function(value) captured[#captured + 1] = tostring(value) end,',
      '}, { __index = function(_, key) if key == "loadstring" then return nil end return _G[key] end })',
      'setfenv(payload, env)',
      'payload()',
      'print(table.concat(captured, ""))',
    ].join('\n');

    expect(runLua(runtime, wrapper).trim()).toBe('reader loader fallback ok');
  });

  it('resolves Roblox-like APIs through the payload execution environment', () => {
    const runtime = process.env.FREZEN_LUA_RUNTIME;
    if (!runtime) return;

    const result = compileFrezenVmV4([
      'local gui = Instance.new("ScreenGui")',
      'gui.Name = "Frezen UI"',
      'local players = game:GetService("Players")',
      'print(gui.ClassName, gui.Name, players.Name)',
    ].join('\n'));

    const wrapper = [
      'local captured = {}',
      'local customPrint = function(...)',
      '  local parts = {}',
      '  for i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end',
      '  captured[#captured + 1] = table.concat(parts, " ")',
      'end',
      'local payload = function()',
      result.code,
      'end',
      'setfenv(payload, setmetatable({',
      '  print = customPrint,',
      '  Instance = { new = function(className) return { ClassName = className } end },',
      '  game = { GetService = function(_, name) return { Name = name } end },',
      '}, { __index = _G }))',
      'payload()',
      'print(table.concat(captured, "\\n"))',
    ].join('\n');

    const stdout = runLua(runtime, wrapper);
    expect(stdout.trim()).toBe('ScreenGui Frezen UI Players');
  });
});
