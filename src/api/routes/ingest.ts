import { Router } from 'express';
import type Database from 'better-sqlite3';
import { runIngestion, type IngestionReport } from '../../ingestion/orchestrator.js';
import { runGitAiIngestion, type GitAiIngestionReport } from '../../ingestion/gitai-orchestrator.js';
import { setLastIngestionRun } from './status.js';
import { log } from '../../utils/logger.js';
import { randomUUID } from 'node:crypto';

interface CombinedReport {
  entire: IngestionReport;
  gitai: GitAiIngestionReport;
}

let lastReport: CombinedReport = {
  entire: { sessions: 0, checkpoints: 0, links: 0, errors: [] },
  gitai: { commits: 0, repos: 0, errors: [] },
};

export async function runIngestionCycle(db: Database.Database): Promise<CombinedReport> {
  try {
    log('info', 'Ingestion cycle starting');
    const entireReport = await runIngestion(db);
    const gitaiReport = await runGitAiIngestion(db);
    setLastIngestionRun(new Date().toISOString());
    lastReport = { entire: entireReport, gitai: gitaiReport };
    log('info', 'Ingestion cycle complete', {
      sessions: entireReport.sessions,
      checkpoints: entireReport.checkpoints,
      links: entireReport.links,
      gitai_commits: gitaiReport.commits,
    });
    return lastReport;
  } catch (err) {
    log('error', 'Ingestion cycle failed', { error: String(err) });
    lastReport = {
      entire: { sessions: 0, checkpoints: 0, links: 0, errors: [String(err)] },
      gitai: { commits: 0, repos: 0, errors: [String(err)] },
    };
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
