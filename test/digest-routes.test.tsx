import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Plan morning-digest § 2d. Route tests for GET /digest/:night (§ 2a, issue #2) and
// GET /api/digest/:night (§ 2b, issue #3).
//
// SKIPPED until #2 and #3 are merged: this branch has neither route, so every request here
// would answer 404 for the wrong reason. To un-skip, change `describe.skip` to `describe`.

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

// Jobs are written out of order on purpose: both routes must sort by job.
const GOOD_NIGHT = [
  line('2026-10-28T23:00:02+01:00', 'zeta/cleanup', 'ok', 'rook'),
  line('2026-10-28T23:00:06+01:00', 'alpha/sync', 'retry', 'lane-07', 'timeout'),
  line('2026-10-29T00:00:04+01:00', 'alpha/sync', 'retry', 'lane-07', 'timeout'),
  line('2026-10-29T01:00:04+01:00', 'alpha/sync', 'retry', 'lane-07', 'timeout'),
  line('2026-10-29T02:00:04+01:00', 'alpha/sync', 'ok', 'lane-07'),
  line('2026-10-29T03:00:00+01:00', 'mid/build', 'fail', null, 'exit 1'),
].join('\n');
const JOBS_IN_ORDER = ['alpha/sync', 'mid/build', 'zeta/cleanup'];

const BAD_NIGHT = [
  line('2026-10-30T23:00:00+01:00', 'beta/job', 'ok', 'rook'),
  '{"at":"2026-10-30T23:05:00+01:00","job":"trunc',
  line('2026-10-30T23:10:00+01:00', 'alpha/job', 'ok', 'rook'),
].join('\n');

let runsDir = '';

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), `${GOOD_NIGHT}\n`);
  writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');
  writeFileSync(join(runsDir, '2026-10-30.jsonl'), `${BAD_NIGHT}\n`);
});

afterAll(() => {
  if (runsDir !== '') rmSync(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

// The JSON route returns the rows, either bare or under `rows` (NightDigest). Parse at the
// edge, return the job names in the order given.
async function jsonJobs(res: Response): Promise<string[]> {
  const body: unknown = await res.json();
  const rows: unknown =
    typeof body === 'object' && body !== null && !Array.isArray(body) && 'rows' in body
      ? (body as { rows: unknown }).rows
      : body;
  if (!Array.isArray(rows)) throw new Error('JSON body holds no rows array');
  return rows.map((row: unknown) => {
    if (typeof row !== 'object' || row === null || !('job' in row) || typeof row.job !== 'string') {
      throw new Error('a row has no job');
    }
    return row.job;
  });
}

function jobsInPage(html: string): string[] {
  return JOBS_IN_ORDER.filter((job) => html.includes(job)).sort((a, b) => html.indexOf(a) - html.indexOf(b));
}

describe.skip('digest page GET /digest/:night (waits on #2)', () => {
  it('200: renders the jobs in order, with the failure and the 3 retries shown', async () => {
    const res = await app().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(jobsInPage(html)).toEqual(JOBS_IN_ORDER);
    expect(html).toContain('fail');
    expect(html).toContain('—'); // mid/build has owner null
  });

  it('404: a night with no file', async () => {
    const res = await app().request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('empty night: 200 and "nothing ran"', async () => {
    const res = await app().request('/digest/2026-10-29');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('bad line: the night still renders with its good rows', async () => {
    const res = await app().request('/digest/2026-10-30');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/job');
    expect(html).toContain('beta/job');
  });
});

describe.skip('digest JSON GET /api/digest/:night (waits on #3)', () => {
  it('200: returns JSON with the jobs in order', async () => {
    const res = await app().request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await jsonJobs(res)).toEqual(JOBS_IN_ORDER);
  });

  it('404: a night with no file', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('empty night: 200 and no rows', async () => {
    const res = await app().request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    expect(await jsonJobs(res)).toEqual([]);
  });

  it('bad line: 200 with the good rows only', async () => {
    const res = await app().request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await jsonJobs(res)).toEqual(['alpha/job', 'beta/job']);
  });
});

describe.skip('page and JSON agree (waits on #2 and #3)', () => {
  it.each(['2026-10-28', '2026-10-29', '2026-10-30'])('%s: same jobs, same order', async (night) => {
    const page = await (await app().request(`/digest/${night}`)).text();
    const json = await jsonJobs(await app().request(`/api/digest/${night}`));
    expect(jobsInPage(page)).toEqual(json.filter((job) => page.includes(job)));
    expect(json).toEqual([...json].sort());
  });
});
