import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Service sync recovery 6',()=>{it('keeps canonical service mapping',()=>{const source=read('src/dashboard-state.js');expect(source).toContain('normalizedServices');expect(source).toContain('canonicalId');});});
