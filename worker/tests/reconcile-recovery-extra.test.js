import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Dashboard reconcile recovery contract',()=>{it('keeps stale service identity recovery in source',()=>{const source=read('src/dashboard-state.js');expect(source).toContain('canonicalId = bySlug.id');expect(source).toContain("error:'DATABASE_ERROR', message:");});});
