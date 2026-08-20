import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(file)=>fs.readFileSync(path.resolve(process.cwd(),file),'utf8');
describe('Dashboard sync regression 3',()=>{it('keeps DB-backed reconciliation source',()=>{const source=read('src/dashboard-state.js');expect(source).toContain('getCanonicalDashboardState');expect(source).toContain('reconcileDashboardState');});});
