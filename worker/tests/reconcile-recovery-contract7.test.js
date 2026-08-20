import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Service persistence regression 7',()=>{it('tracks canonical server mapping',()=>{const source=read('src/dashboard-state.js');expect(source).toContain('SELECT id,active FROM frezen_key_services');expect(source).toContain('canonicalId = bySlug.id');});});
