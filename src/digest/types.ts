// Plan morning-digest § 1. The shape the digest is read through: one row per job, the night
// that holds them, and the reader's signature. Committed before the reader, so the page, the
// JSON and the board can start against it.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night. `owner` and `lastError` stay null when the log never gave one: the view
// shows `—`, the row keeps what the log said (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  // The timestamps as the log wrote them, offset included, never converted to UTC (styleguide).
  firstAt: string;
  lastAt: string;
};

// One night's log, read. `rows` is sorted by job, so the page and the JSON cannot disagree.
// `badLines` counts the lines that did not parse: counted, never thrown.
export type NightDigest = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

// Reads `<runsDir>/<night>.jsonl`. Returns null when that night has no file, so a route can
// answer 404; an empty file is a night with no rows.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
