import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Service reconciliation contract',()=>{it('contains canonical slug recovery',()=>{const source=read('src/dashboard-state.js');expect(source).toContain('const normalizedServices = []');expect(source).toContain('const bySlug = await env.DB.prepare');expect(source).toContain('canonicalId = bySlug.id');});});
