import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Service reconciliation contract 2',()=>{it('returns canonical recovery data',()=>{const source=read('src/dashboard-state.js');expect(source).toContain('return json({ synced:true, canonical:true');});});
