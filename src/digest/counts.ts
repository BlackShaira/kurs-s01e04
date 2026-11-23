import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './reader.js';
import type { RunStatus } from './types.js';

// Plan morning-digest § 2c. A night's totals per status: one count per run line, not per job.
// `DigestRow` keeps only `lastStatus`, so the totals come from the same lines through the
// reader's own parser. Lines that do not parse are not counted (the reader counts them as bad).
export type NightCounts = Record<RunStatus, number>;

// Null when the night has no readable file: the board shows `—`.
export function countNight(runsDir: string, night: string): NightCounts | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const event = parseLine(line);
    if (event !== null) counts[event.status] += 1;
  }
  return counts;
}
