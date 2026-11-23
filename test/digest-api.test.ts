import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/reader.js';
import type { NightDigest } from '../src/digest/types.js';

const config = { adapter: 'test', installed: 'x', beatEverySeconds: 60, runsDir: 'runs' };

describe('GET /api/digest/:night', () => {
  it('returns the reader digest, same jobs in the same order', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body).toEqual(readNight('runs', '2026-10-28'));
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it('404s for a night with no file and for a name that is not a date', async () => {
    const app = createApp(config);
    expect((await app.request('/api/digest/2020-01-01')).status).toBe(404);
    expect((await app.request('/api/digest/..%2Fconfig')).status).toBe(404);
  });

  it('answers an empty night with no rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    const res = await createApp({ ...config, runsDir: dir }).request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });
});
