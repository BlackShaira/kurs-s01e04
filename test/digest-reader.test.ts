import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';
import type { DigestRow } from '../src/digest/types.js';

// `runs/` is read-only: these are the real nights. Anything this test needs to write goes to
// its own temp dir.
const RUNS = 'runs';

function tempRuns(night: string, text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, `${night}.jsonl`), text);
  return dir;
}

function row(digest: { rows: DigestRow[] }, job: string): DigestRow {
  const found = digest.rows.find((r) => r.job === job);
  if (found === undefined) throw new Error(`no row for ${job}`);
  return found;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight(RUNS, '2026-10-28');
  if (digest === null) throw new Error('the night 2026-10-28 is on disk and must read');

  it('reads five jobs and counts the one line that does not parse', () => {
    expect(digest.badLines).toBe(1);
    expect(digest.rows).toHaveLength(5);
  });

  it('names the night and sorts the rows by job', () => {
    expect(digest.night).toBe('2026-10-28');
    expect(digest.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts every run of a job and keeps its first and last time with the log offset', () => {
    expect(row(digest, 'lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });

  it('keeps the retries and the error of a job that recovered', () => {
    expect(row(digest, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a failure with its error', () => {
    expect(row(digest, 'notes/backup')).toMatchObject({
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      owner: 'lane-07',
    });
  });

  it('keeps the row of a job with no owner, and keeps the owner null', () => {
    expect(row(digest, 'digest/render')).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
  });

  it('never converts a time to UTC', () => {
    for (const r of digest.rows) {
      expect(r.firstAt).toMatch(/\+01:00$/);
      expect(r.lastAt).toMatch(/\+01:00$/);
    }
  });
});

describe('readNight on the other nights and on edges', () => {
  it('reads a night with no bad line', () => {
    const digest = readNight(RUNS, '2026-10-27');
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows.map((r) => r.job)).toEqual([
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('returns null for a night with no file', () => {
    expect(readNight(RUNS, '1999-01-01')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    const dir = tempRuns('2026-11-01', '');
    expect(readNight(dir, '2026-11-01')).toEqual({ night: '2026-11-01', rows: [], badLines: 0 });
  });

  it('counts every unparsable line and still renders the rest of the night', () => {
    const lines = [
      '{"at":"2026-11-02T23:00:00+02:00","job":"a","status":"ok","owner":"rook"}',
      'not json at all',
      '{"at":"2026-11-02T23:30:00+02:00","job":"a","status":"wat","owner":"rook"}',
      '{"at":"not a time","job":"a","status":"ok","owner":"rook"}',
      '{"job":"a","status":"ok","owner":"rook"}',
      '[]',
      '{"at":"2026-11-03T00:00:00+02:00","job":"a","status":"fail","owner":7}',
      '',
      '{"at":"2026-11-03T01:00:00+02:00","job":"a","status":"retry","error":"late"}',
    ].join('\n');
    const digest = readNight(tempRuns('2026-11-02', lines), '2026-11-02');
    expect(digest?.badLines).toBe(6);
    expect(digest?.rows).toEqual([
      {
        job: 'a',
        owner: 'rook',
        runs: 2,
        retries: 1,
        lastStatus: 'retry',
        lastError: 'late',
        firstAt: '2026-11-02T23:00:00+02:00',
        lastAt: '2026-11-03T01:00:00+02:00',
      },
    ]);
  });

  it('orders a night whose lines are out of order', () => {
    const lines = [
      '{"at":"2026-11-04T05:00:00+01:00","job":"b","status":"fail","owner":null,"error":"late"}',
      '{"at":"2026-11-03T23:00:00+01:00","job":"b","status":"retry","owner":"rook","error":"early"}',
    ].join('\n');
    const digest = readNight(tempRuns('2026-11-03', lines), '2026-11-03');
    expect(digest?.rows[0]).toMatchObject({
      owner: 'rook',
      runs: 2,
      retries: 1,
      lastStatus: 'fail',
      lastError: 'late',
      firstAt: '2026-11-03T23:00:00+01:00',
      lastAt: '2026-11-04T05:00:00+01:00',
    });
  });
});
