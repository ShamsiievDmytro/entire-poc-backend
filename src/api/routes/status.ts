import { Router } from 'express';
import type Database from 'better-sqlite3';

let lastIngestionRun: string | null = null;

export function setLastIngestionRun(time: string) {
  lastIngestionRun = time;
}

export function statusRoutes(db: Database.Database): Router {
  const router = Router();

  const sessionCountStmt = db.prepare('SELECT COUNT(*) as n FROM sessions');
  const checkpointCountStmt = db.prepare('SELECT COUNT(*) as n FROM repo_checkpoints');
  const linkCountStmt = db.prepare('SELECT COUNT(*) as n FROM session_commit_links');
  const reposStmt = db.prepare('SELECT DISTINCT repo FROM repo_checkpoints');

  router.get('/status', (_req, res) => {
    const sessionCount = (sessionCountStmt.get() as { n: number }).n;
    const checkpointCount = (checkpointCountStmt.get() as { n: number }).n;
    const linkCount = (linkCountStmt.get() as { n: number }).n;
    const repos = (reposStmt.all() as { repo: string }[]).map(r => r.repo);

    res.json({
      version: '0.1.0',
      patternVersion: 'A-star-v1',
      lastRun: lastIngestionRun,
      repos,
      sessionCount,
      checkpointCount,
      linkCount,
    });
  });

  return router;
}
