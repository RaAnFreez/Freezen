import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Service persistence regression',()=>{it('keeps server identity recovery logic',()=>{const source=read('src/dashboard-state.js');expect(source).toContain('const normalizedServices = []');expect(source).toContain('const bySlug = await env.DB.prepare');});});
