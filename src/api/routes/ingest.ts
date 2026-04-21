import { Router } from 'express';
import type Database from 'better-sqlite3';
import { runIngestion, type IngestionReport } from '../../ingestion/orchestrator.js';
import { setLastIngestionRun } from './status.js';
import { log } from '../../utils/logger.js';
import { randomUUID } from 'node:crypto';

let lastReport: IngestionReport = { sessions: 0, checkpoints: 0, links: 0, errors: [] };

export async function runIngestionCycle(db: Database.Database): Promise<IngestionReport> {
  try {
    log('info', 'Ingestion cycle starting');
    const report = await runIngestion(db);
    setLastIngestionRun(new Date().toISOString());
    lastReport = report;
    log('info', 'Ingestion cycle complete', { sessions: report.sessions, checkpoints: report.checkpoints, links: report.links });
    return report;
  } catch (err) {
    log('error', 'Ingestion cycle failed', { error: String(err) });
    lastReport = { sessions: 0, checkpoints: 0, links: 0, errors: [String(err)] };
    return lastReport;
  }
}

export function ingestRoutes(db: Database.Database): Router {
  const router = Router();

  router.post('/ingest/run', async (_req, res) => {
    const jobId = randomUUID();
    try {
      const report = await runIngestionCycle(db);
      res.json({ jobId, startedAt: new Date().toISOString(), ...report });
    } catch (err) {
      log('error', 'Manual ingestion trigger failed', { error: String(err) });
      res.status(500).json({ jobId, error: 'Ingestion failed' });
    }
  });

  return router;
}
