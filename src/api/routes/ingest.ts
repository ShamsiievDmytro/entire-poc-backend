import { Router } from 'express';
import type Database from 'better-sqlite3';
import { runIngestion } from '../../ingestion/orchestrator.js';
import { setLastIngestionRun } from './status.js';
import { log } from '../../utils/logger.js';
import { randomUUID } from 'node:crypto';

export function ingestRoutes(db: Database.Database): Router {
  const router = Router();

  router.post('/ingest/run', async (_req, res) => {
    const jobId = randomUUID();
    const startedAt = new Date().toISOString();
    log('info', 'Ingestion triggered', { jobId });

    try {
      const report = await runIngestion(db);
      setLastIngestionRun(new Date().toISOString());
      res.json({ jobId, startedAt, ...report });
    } catch (err) {
      log('error', 'Ingestion failed', { error: String(err) });
      res.status(500).json({ jobId, startedAt, error: String(err) });
    }
  });

  return router;
}
