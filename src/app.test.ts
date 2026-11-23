import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { countNight } from './digest/counts.js';

const line = (status: string, job = 'a') => JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job, status });

describe('board links', () => {
  it('links each night to its digest with counts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(dir, '2026-10-28.jsonl'), [line('ok'), line('retry'), line('ok', 'b'), 'junk'].join('\n'));
    expect(countNight(dir, '2026-10-28')).toEqual({ ok: 2, retry: 1, fail: 0 });
    expect(countNight(dir, '2026-01-01')).toBeNull();
    const app = createApp({ adapter: 'x', installed: 'y', beatEverySeconds: 1, runsDir: dir });
    const html = await (await app.request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('ok 2 · retry 1 · fail 0');
  });
});
