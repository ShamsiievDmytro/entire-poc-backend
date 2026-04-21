import { Router } from 'express';
import type Database from 'better-sqlite3';

let lastIngestionRun: string | null = null;

export function setLastIngestionRun(time: string) {
  lastIngestionRun = time;
}

export function statusRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const sessionCount = (db.prepare('SELECT COUNT(*) as n FROM sessions').get() as { n: number }).n;
    const checkpointCount = (db.prepare('SELECT COUNT(*) as n FROM repo_checkpoints').get() as { n: number }).n;
    const linkCount = (db.prepare('SELECT COUNT(*) as n FROM session_commit_links').get() as { n: number }).n;
    const repos = (db.prepare('SELECT DISTINCT repo FROM repo_checkpoints').all() as { repo: string }[]).map(r => r.repo);

    res.json({
      version: '0.1.0',
      lastRun: lastIngestionRun,
      repos,
      sessionCount,
      checkpointCount,
      linkCount,
    });
  });

  return router;
}
