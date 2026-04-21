import { config } from './config.js';
import { initDb } from './db/migrations.js';
import { createServer } from './api/server.js';
import { runIngestionCycle } from './api/routes/ingest.js';
import { log } from './utils/logger.js';

const db = initDb(config.DB_PATH);
const app = createServer(db);

app.listen(config.PORT, async () => {
  log('info', `Backend listening on port ${config.PORT}`);

  // Run initial ingestion
  await runIngestionCycle(db);

  // Schedule periodic ingestion using recursive setTimeout to prevent overlap
  function scheduleNext() {
    setTimeout(async () => {
      try {
        await runIngestionCycle(db);
      } catch (err) {
        log('error', 'Scheduled ingestion failed', { error: String(err) });
      }
      scheduleNext();
    }, config.INGESTION_INTERVAL_MS);
  }
  scheduleNext();
});
