import { Router } from 'express';
import type Database from 'better-sqlite3';

export function sessionRoutes(db: Database.Database): Router {
  const router = Router();

  // Cross-Repo Session Map (must come before :sessionId to avoid shadowing)
  router.get('/sessions/cross-repo', (_req, res) => {
    const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all() as {
      session_id: string;
      started_at: string;
      ended_at: string | null;
      agent: string | null;
    }[];

    const result = sessions.map((s) => {
      const touches = db.prepare(
        'SELECT DISTINCT repo FROM session_repo_touches WHERE session_id = ?'
      ).all(s.session_id) as { repo: string }[];

      const links = db.prepare(
        'SELECT repo, checkpoint_id, confidence, confidence_score FROM session_commit_links WHERE session_id = ?'
      ).all(s.session_id) as { repo: string; checkpoint_id: string; confidence: string; confidence_score: number }[];

      return {
        sessionId: s.session_id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        agent: s.agent,
        repos: touches.map((t) => t.repo),
        commits: links.map((l) => ({
          repo: l.repo,
          checkpointId: l.checkpoint_id,
          confidence: l.confidence,
          confidenceScore: l.confidence_score,
        })),
        confidence: links.length > 0
          ? links.reduce((best, l) => (l.confidence_score > best.confidence_score ? l : best)).confidence
          : null,
      };
    });

    res.json(result);
  });

  // Session drill-down
  router.get('/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const touches = db.prepare('SELECT * FROM session_repo_touches WHERE session_id = ?').all(sessionId);
    const links = db.prepare('SELECT * FROM session_commit_links WHERE session_id = ?').all(sessionId);

    res.json({ session, touches, links });
  });

  return router;
}
