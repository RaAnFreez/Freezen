import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key service-id state regression', () => {
  it('resolves flow state from the session service id', () => {
    const helper = read('src/getkey-service-id-state.js');
    const adapter = read('src/getkey-single-claim-service-id.js');
    const entry = read('src/entry-ui-getkey.js');

    expect(helper).toContain('FROM frezen_key_services WHERE id = ?1 LIMIT 1');
    expect(helper).toContain('loadServiceById(env, session.service_id)');
    expect(adapter).toContain('getPublicGetKeyStateByServiceId');
    expect(adapter).toContain('launchGetKeyCheckpointByServiceId');
    expect(entry).toContain("./getkey-single-claim-service-id.js");
  });
});
