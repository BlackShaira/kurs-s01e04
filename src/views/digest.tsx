import type { DigestRow, NightDigest } from '../digest/types.js';

const MISSING = '—';
const RETRY_MARK_AT = 3;

function marks(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.lastStatus === 'fail') out.push('fail');
  if (row.retries >= RETRY_MARK_AT) out.push(`${row.retries} retries`);
  return out;
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
              <th>mark</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const m = marks(row);
              return (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? MISSING}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
                  <td>{row.lastError ?? MISSING}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td class="warn">{m.length > 0 ? m.join(', ') : MISSING}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {digest.badLines > 0 && (
        <p class="mute">{digest.badLines} line(s) in the log did not parse and are not counted above.</p>
      )}
    </>
  );
}

export function NotFound({ night }: { night: string }) {
  return (
    <>
      <h1>no digest</h1>
      <p class="mute">no run log for {night}</p>
    </>
  );
}
