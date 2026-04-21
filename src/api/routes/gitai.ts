import { Router } from 'express';
import type Database from 'better-sqlite3';
import { createGitAiRepo } from '../../db/gitai-repo.js';

export function gitaiRoutes(db: Database.Database): Router {
  const router = Router();
  const gitaiRepo = createGitAiRepo(db);

  // GET /api/gitai/commits — all commits with attribution
  router.get('/gitai/commits', (_req, res) => {
    const rows = gitaiRepo.getAll();
    res.json(rows);
  });

  // GET /api/gitai/commits/:sha — detail for one commit
  router.get('/gitai/commits/:sha', (req, res) => {
    const rows = gitaiRepo.getBySha(req.params.sha);
    if (rows.length === 0) {
      res.status(404).json({ error: 'No Git AI attribution found for this commit' });
      return;
    }
    res.json({
      commit_sha: req.params.sha,
      attributions: rows,
      files: rows.flatMap((r) => {
        try { return JSON.parse(r.files_touched_json ?? '[]'); }
        catch { return []; }
      }),
    });
  });

  // GET /api/gitai/summary — aggregated summary
  router.get('/gitai/summary', (_req, res) => {
    const byRepo = gitaiRepo.summaryByRepo();
    const byAgent = gitaiRepo.summaryByAgent();
    const total = gitaiRepo.count();
    res.json({ total, byRepo, byAgent });
  });

  // GET /api/compare/entire-vs-gitai — side-by-side comparison
  const compareStmt = db.prepare(`
    SELECT
      g.commit_sha,
      g.repo,
      g.agent AS gitai_agent,
      g.model AS gitai_model,
      g.agent_lines AS gitai_agent_lines,
      g.human_lines AS gitai_human_lines,
      g.agent_percentage AS gitai_agent_pct,
      g.files_touched_json AS gitai_files,
      rc.agent_percentage AS entire_agent_pct,
      rc.agent_lines AS entire_agent_lines,
      rc.files_touched_json AS entire_files,
      scl.confidence AS link_confidence,
      scl.join_reason AS link_reason
    FROM gitai_commit_attribution g
    LEFT JOIN repo_checkpoints rc
      ON rc.commit_sha = g.commit_sha AND rc.repo = g.repo
    LEFT JOIN session_commit_links scl
      ON scl.checkpoint_id = g.commit_sha AND scl.repo = g.repo
    ORDER BY g.captured_at DESC
  `);

  router.get('/compare/entire-vs-gitai', (_req, res) => {
    const rows = compareStmt.all();
    res.json(rows);
  });

  return router;
}
