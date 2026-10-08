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

  it('supports Lua 5.1 numeric for statements', () => {
    const result = compileFrezenVmV3([
      'local total = 0',
      'for i = 1, 3 do',
      '  total = total + i',
      'end',
      'print(total)',
    ].join('\\n'));
    expect(result.code).toContain('FREZEN_VM_V3_BAD_EXPR');
    expect(result.code).not.toContain('VM_V3_UNSUPPORTED_STATEMENT:ForNumericStatement');
  });

  it('uses the Lua 5.1 source grammar for obfuscation input', () => {
    expect(FREZEN_VM_V3_LUA_VERSION).toBe('5.1');
    expect(() => compileFrezenVmV3('local x = 7 // 2')).toThrow(/VM_V3_PARSE_FAILED:/);
    expect(() => compileFrezenVmV3('local x = 1 & 2')).toThrow(/VM_V3_PARSE_FAILED:/);
    expect(() => compileFrezenVmV3('goto nope\n::nope::')).toThrow(/VM_V3_PARSE_FAILED:/);
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
      expect(run.stdout.trim().split(/\r?\n/)).toEqual(['12', '12']);
      expect(run.stdout).not.toContain('FREZEN_SECRET_RUNTIME_ONLY');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
