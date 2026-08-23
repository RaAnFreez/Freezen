import { describe, expect, it } from 'vitest';
import { buildCompactLoaderSource, buildRuntimeLoaderSource } from './short-loader.js';

describe('Frezen runtime loader diagnostics', () => {
  const request = new Request('https://frezen.example/loader/script-123?bootstrap=1&key=demo');

  it('generates a compact bootstrap loader with explicit diagnostics', () => {
    const source = buildCompactLoaderSource(request, 'script-123');
    expect(source).toContain('FREZEN_BOOTSTRAP_HTTP_FAILED');
    expect(source).toContain('FREZEN_LOADSTRING_UNAVAILABLE');
    expect(source).toContain('FREZEN_BOOTSTRAP_COMPILE_FAILED');
    expect(source).toContain('FREZEN_BOOTSTRAP_RUNTIME_FAILED');
  });

  it('generates a runtime loader that distinguishes HTTP, compile, and runtime failures', () => {
    const source = buildRuntimeLoaderSource(request, 'script-123', 'demo-key');
    expect(source).toContain('FREZEN_PAYLOAD_HTTP_FAILED');
    expect(source).toContain('FREZEN_PAYLOAD_EMPTY');
    expect(source).toContain('FREZEN_LOADSTRING_UNAVAILABLE');
    expect(source).toContain('FREZEN_PAYLOAD_COMPILE_FAILED');
    expect(source).toContain('FREZEN_PAYLOAD_RUNTIME_FAILED');
    expect(source).toContain('local _frezen_load=loadstring or load;');
  });
});
