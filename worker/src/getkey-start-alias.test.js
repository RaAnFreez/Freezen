import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key alias-backed start', () => {
  it('passes the canonical service slug to the runtime', () => {
    const source = read('src/getkey-single-claim-service-id.js');
    expect(source).toContain('resolveServiceForStart');
    expect(source).toContain('startRuntime(request, env, service.slug)');
  });
});
