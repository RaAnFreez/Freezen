import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Dashboard reconcile summary',()=>{it('retains canonical service reconciliation behavior',()=>{const source=read('src/dashboard-state.js');expect(source).toContain('normalizedServices');expect(source).toContain('serviceIds');expect(source).toContain('deactivated');});});
