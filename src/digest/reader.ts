import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

// Plan morning-digest § 1. The night's log is JSONL: one run per line. A line that does not
// hold the shape is counted and dropped, never thrown, so one truncated write cannot cost the
// reader the whole night.

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

function isRunStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function optionalText(value: unknown): { ok: true; text: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, text: null };
  if (typeof value === 'string') return { ok: true, text: value };
  return { ok: false };
}

// Parse at the edge: one line in, one event or null. Everything after this trusts the types.
export function parseLine(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const fields: Record<string, unknown> = value as Record<string, unknown>;
  const { at, job, status } = fields;
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isRunStatus(status)) return null;
  const owner = optionalText(fields.owner);
  const error = optionalText(fields.error);
  if (!owner.ok || !error.ok) return null;
  return { at, job, status, owner: owner.text, error: error.text };
}

// One row per job, oldest run first. `lastStatus` and `lastAt` come from the job's last run.
// `lastError` and `owner` keep the last value the log actually gave: an error is written only
// on a retry or a fail, so pinning it to the last line would throw away what went wrong the
// moment a job recovered, and a job whose last line has `owner: null` is still owned by
// whoever the earlier lines named. Both stay null when no line ever gave one.
function fold(events: RunEvent[]): DigestRow[] {
  const rows = new Map<string, DigestRow>();
  for (const event of events) {
    const row = rows.get(event.job);
    if (row === undefined) {
      rows.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error,
        firstAt: event.at,
        lastAt: event.at,
      });
      continue;
    }
    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== null) row.lastError = event.error;
    if (event.owner !== null) row.owner = event.owner;
  }
  // Sorted by job, by code unit, so every machine reads the same order.
  return [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

export const readNight: ReadNight = (runsDir, night) => {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  let badLines = 0;
  const events: RunEvent[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue; // a blank line is not a run and not a bad line
    const event = parseLine(line);
    if (event === null) {
      badLines += 1;
      continue;
    }
    events.push(event);
  }

  // Order the runs by the instant they name, keeping the text the log wrote. Comparing two
  // offsets is not converting either: `firstAt` and `lastAt` are copied, never reformatted.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return { night, rows: fold(events), badLines };
};
