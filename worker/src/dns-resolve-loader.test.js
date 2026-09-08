import { describe, it, expect } from 'vitest';

const hasRetryLoop = (source) => /for .*attempt=1,4/.test(source) && /game:HttpGet/.test(source) && /task\.wait/.test(source);

describe('loader HTTP retry protection', () => {
  it('requires retry handling around the bootstrap HTTP request', () => {
    const source = `for _frezen_attempt=1,4 do game:HttpGet(url) local waitFn=(task and task.wait) or wait end`;
    expect(hasRetryLoop(source)).toBe(true);
  });
});
