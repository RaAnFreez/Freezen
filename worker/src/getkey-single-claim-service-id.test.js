import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key custom slug start regression', () => {
  it('resolves direct and alias slugs before invoking the service-id runtime', () => {
    const adapter = read('src/getkey-single-claim-service-id.js');

    expect(adapter).toContain('function resolveServiceForStart');
    expect(adapter).toContain('FROM frezen_key_services WHERE slug = ?1 LIMIT 1');
    expect(adapter).toContain('FROM frezen_key_service_aliases');
    expect(adapter).toContain('FROM frezen_key_services WHERE id = ?1 LIMIT 1');
    expect(adapter).toContain('startRuntime(request, env, service.slug)');
    expect(adapter).not.toContain('startRuntime(request, env, slug);');
  });
});
