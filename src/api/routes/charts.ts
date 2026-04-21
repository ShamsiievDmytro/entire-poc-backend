export const SCENARIO_6_MARKER = 'orphan-test';

import { Router } from 'express';
import type Database from 'better-sqlite3';

export function chartRoutes(db: Database.Database): Router {
  const router = Router();

  // Chart 1: Sessions Over Time
  router.get('/charts/sessions-over-time', (_req, res) => {
    const rows = db.prepare(`
      SELECT DATE(started_at) as date, COUNT(*) as count
      FROM sessions
      WHERE started_at IS NOT NULL
      GROUP BY DATE(started_at)
      ORDER BY date
    `).all();
    res.json(rows);
  });

  // Chart 4: Agent % per Commit
  router.get('/charts/agent-percentage', (_req, res) => {
    const rows = db.prepare(`
      SELECT
        checkpoint_id as commit,
        repo,
        agent_percentage as agentPercentage,
        committed_at as committedAt
      FROM repo_checkpoints
      WHERE agent_percentage IS NOT NULL
      ORDER BY committed_at
    `).all();
    res.json(rows);
  });

  // Chart 14: Slash Command Frequency
  router.get('/charts/slash-commands', (_req, res) => {
    const touches = db.prepare('SELECT slash_commands_json FROM session_repo_touches').all() as { slash_commands_json: string }[];
    const counts = new Map<string, number>();
    for (const row of touches) {
      const cmds: string[] = JSON.parse(row.slash_commands_json);
      for (const cmd of cmds) {
        counts.set(cmd, (counts.get(cmd) || 0) + 1);
      }
    }
    const result = [...counts.entries()]
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count);
    res.json(result);
  });

  // Chart 21: Tool Usage Mix
  router.get('/charts/tool-usage', (_req, res) => {
    const touches = db.prepare('SELECT tool_calls_json FROM session_repo_touches').all() as { tool_calls_json: string }[];
    const counts = new Map<string, number>();
    for (const row of touches) {
      const tools: Record<string, number> = JSON.parse(row.tool_calls_json);
      for (const [tool, count] of Object.entries(tools)) {
        counts.set(tool, (counts.get(tool) || 0) + count);
      }
    }
    const result = [...counts.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count);
    res.json(result);
  });

  // Chart 25: Friction per Session
  router.get('/charts/friction', (_req, res) => {
    const rows = db.prepare(`
      SELECT session_id as sessionId, friction_count as count, friction_json
      FROM sessions
      ORDER BY friction_count DESC
    `).all() as { sessionId: string; count: number; friction_json: string | null }[];

    const result = rows.map((r) => ({
      sessionId: r.sessionId,
      count: r.count,
      items: r.friction_json ? JSON.parse(r.friction_json) : [],
    }));
    res.json(result);
  });

  // Chart 26: Open Items per Session
  router.get('/charts/open-items', (_req, res) => {
    const rows = db.prepare(`
      SELECT session_id as sessionId, open_items_count as count, open_items_json
      FROM sessions
      ORDER BY open_items_count DESC
    `).all() as { sessionId: string; count: number; open_items_json: string | null }[];

    const result = rows.map((r) => ({
      sessionId: r.sessionId,
      count: r.count,
      items: r.open_items_json ? JSON.parse(r.open_items_json) : [],
    }));
    res.json(result);
  });

  // Summary endpoint for cross-repo validation
  router.get('/charts/summary', (_req, res) => {
    res.json({ totalEndpoints: 10, description: "Cross-repo validation test" });
  });

  return router;
}
