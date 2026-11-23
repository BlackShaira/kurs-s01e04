import { Hono } from 'hono';
import { countNight, type NightCounts } from './digest/counts.js';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) => {
    const status = readStatus(config);
    const counts: Record<string, NightCounts | null> = {};
    for (const night of status.nights) counts[night] = countNight(config.runsDir, night);
    return c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={status} counts={counts} />
      </Layout>,
    );
  });

  return app;
}
