import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { compileFrezenVmV2 } from './frezen-vm-v2.js';
import { OBFUSCATION_WATERMARK } from './script-obfuscation-contract.js';

function findRuntime() {
  const candidates = process.env.FREZEN_LUA_RUNTIME
    ? [process.env.FREZEN_LUA_RUNTIME]
    : ['luau', 'lua5.4', 'lua'];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      stdio: 'ignore',
    });
    if (!probe.error && probe.status === 0) return candidate;
  }

  return null;
}

function buildStressSource(extra = '') {
  return [
    '-- Frezen VM v2 integration sample',
    'local total = 0',
    'local values = {}',
    'for i = 1, 128 do',
    '  values[i] = i * 17 + 3',
    '  total = total + values[i]',
    'end',
    'local function fold(input)',
    '  local result = 0',
    '  for i = 1, #input do',
    '    result = (result + input[i]) % 65521',
    '  end',
    '  return result',
    'end',
    'assert(fold(values) == total % 65521)',
    `assert(total == 140736)`,
    extra,
    'print("__FREZEN_VM_V2_RUNTIME_OK__")',
  ].join('\n');
}

function buildLargeCommentSource() {
  const lines = [];
  for (let i = 0; i < 6000; i += 1) {
    lines.push(`-- payload-stress-${i.toString(16).padStart(4, '0')} URL=https://frezen.my.id/delivery/v2/${i}`);
  }
  lines.push('print("__FREZEN_VM_V2_LARGE_PAYLOAD_OK__")');
  return lines.join('\n');
}

function runGeneratedScript(runtime, source, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'frezen-vm-v2-'));
  const scriptPath = join(dir, 'generated.luau');

  try {
    const result = compileFrezenVmV2(source, options);
    expect(result.code.startsWith(OBFUSCATION_WATERMARK)).toBe(true);
    expect(result.profile.version).toBe('2.0');
    expect(result.chunkCount).toBeGreaterThan(0);

    writeFileSync(scriptPath, result.code, 'utf8');
    return {
      result,
      stdout: execFileSync(runtime, [scriptPath], {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Frezen VM v2 runtime compatibility', () => {
  const runtime = findRuntime();

  const runtimeTest = runtime ? test : test.skip;

  runtimeTest('executes representative Luau source without decode/checksum failure', () => {
    const { result, stdout } = runGeneratedScript(
      runtime,
      buildStressSource('assert(#"frezen" == 6)'),
      { chunkSize: 48 },
    );

    expect(result.transforms.integrity).toBe('length+checksum16+line-count');
    expect(stdout).toContain('__FREZEN_VM_V2_RUNTIME_OK__');
    expect(stdout).not.toContain('FREZEN_VM_V2_DECODE_');
  });

  runtimeTest('survives chunk-size boundaries with URLs and printable payload data', () => {
    for (const chunkSize of [24, 48, 72]) {
      const { result, stdout } = runGeneratedScript(
        runtime,
        buildStressSource(`assert("${chunkSize}" == tostring(${chunkSize}))`),
        { chunkSize },
      );

      expect(result.chunkCount).toBeGreaterThan(1);
      expect(stdout).toContain('__FREZEN_VM_V2_RUNTIME_OK__');
    }
  });

  runtimeTest('round-trips a multi-thousand-chunk payload to catch key collisions', () => {
    const { result, stdout } = runGeneratedScript(runtime, buildLargeCommentSource(), {
      chunkSize: 24,
    });

    expect(result.chunkCount).toBeGreaterThan(5000);
    expect(stdout).toContain('__FREZEN_VM_V2_LARGE_PAYLOAD_OK__');
    expect(stdout).not.toContain('FREZEN_VM_V2_DECODE_CHECKSUM_MISMATCH');
    expect(stdout).not.toContain('FREZEN_VM_V2_DECODE_LENGTH_MISMATCH');
    expect(stdout).not.toContain('FREZEN_VM_V2_DECODE_LINE_COUNT_MISMATCH');
  });

  test('keeps generated output free of legacy decoder primitives', () => {
    const result = compileFrezenVmV2(buildStressSource(), { chunkSize: 48 });

    expect(result.code).not.toContain('string.find');
    expect(result.code).not.toContain('string.sub');
    expect(result.code).toContain('string.byte');
  });
});
