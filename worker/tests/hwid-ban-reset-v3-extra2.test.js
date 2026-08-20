import { describe, expect, it } from 'vitest';
import { setHwidStatusV2, resetHwidV2 } from '../src/security/hwid-v2.js';
describe('HWID control exports', () => { it('exports block and reset controls', () => { expect(setHwidStatusV2).toBeTypeOf('function'); expect(resetHwidV2).toBeTypeOf('function'); }); });
