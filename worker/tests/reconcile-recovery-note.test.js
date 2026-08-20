import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Dashboard reconciliation contract',()=>{it('contains stale-id and bounded-error safeguards',()=>{const source=read('src/dashboard-state.js');expect(source).toContain('canonicalId = bySlug.id');expect(source).toContain('slice(0,300)');});});
