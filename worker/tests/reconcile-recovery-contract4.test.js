import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Dashboard sync recovery 4',()=>{it('keeps bounded error response',()=>{const source=read('src/dashboard-state.js');expect(source).toContain("slice(0,300)");});});
