import { config } from './config.js';
import { initDb } from './db/migrations.js';
import { createServer } from './api/server.js';
import { log } from './utils/logger.js';

const db = initDb(config.DB_PATH);
const app = createServer(db);

app.listen(config.PORT, () => {
  log('info', `Backend listening on port ${config.PORT}`);
});
