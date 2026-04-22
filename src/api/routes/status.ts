import { Router } from 'express';
import type Database from 'better-sqlite3';

let lastIngestionRun: string | null = null;

/** Update the timestamp of the last successful ingestion run. */
export function setLastIngestionRun(time: string) {
  lastIngestionRun = time;
}

/** Build and return the status routes for the API. */
export function statusRoutes(db: Database.Database): Router {
  const router = Router();

  // Pre-compiled statements for fast repeated queries
  const sessionCountStmt = db.prepare('SELECT COUNT(*) as n FROM sessions');
  const checkpointCountStmt = db.prepare('SELECT COUNT(*) as n FROM repo_checkpoints');
  const linkCountStmt = db.prepare('SELECT COUNT(*) as n FROM session_commit_links');
  const gitaiCountStmt = db.prepare('SELECT COUNT(*) as n FROM gitai_commit_attribution');
  const reposStmt = db.prepare('SELECT DISTINCT repo FROM repo_checkpoints');
  const gitaiReposStmt = db.prepare('SELECT DISTINCT repo FROM gitai_commit_attribution');

  router.get('/status', (_req, res) => {
    const sessionCount = (sessionCountStmt.get() as { n: number }).n;
    const checkpointCount = (checkpointCountStmt.get() as { n: number }).n;
    const linkCount = (linkCountStmt.get() as { n: number }).n;
    const gitaiCommitCount = (gitaiCountStmt.get() as { n: number }).n;

    // Merge repos from both Entire checkpoints and Git AI attribution
    const entireRepos = (reposStmt.all() as { repo: string }[]).map(r => r.repo);
    const gitaiRepos = (gitaiReposStmt.all() as { repo: string }[]).map(r => r.repo);
    const repos = [...new Set([...entireRepos, ...gitaiRepos])];

    res.json({
      version: '0.2.0',
      patternVersion: 'A-star-v1',
      dataSource: 'git-ai',
      lastRun: lastIngestionRun,
      repos,
      sessionCount,
      checkpointCount,
      linkCount,
      gitaiCommitCount,
    });
  });

  return router;
}
