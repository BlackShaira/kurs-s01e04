import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage, NotFound } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

// Both digest routes read through the same `readNight` and keep the rows in the order the
// reader returns them, so the page and the JSON cannot drift apart (ADR 0001). Only a plain
// date names a file: nothing else reaches the filesystem.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = NIGHT.test(night) ? readNight(config.runsDir, night) : null;
    if (digest === null) {
      return c.html(
        <Layout title="no digest" lane={lane()}>
          <NotFound night={night} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <DigestPage digest={digest} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = NIGHT.test(night) ? readNight(config.runsDir, night) : null;
    if (digest === null) return c.json({ error: 'no such night', night }, 404);
    return c.json(digest);
  });

  return app;
}
