import { Router } from 'express';
import type Database from 'better-sqlite3';
import { log } from '../../utils/logger.js';

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function chartRoutes(db: Database.Database): Router {
  const router = Router();

  // Pre-prepare statements (reused across requests instead of per-request)
  const sessionsOverTimeStmt = db.prepare(`
    SELECT DATE(started_at) as date, COUNT(*) as count
    FROM sessions
    WHERE started_at IS NOT NULL
    GROUP BY DATE(started_at)
    ORDER BY date
  `);
  const agentPercentageStmt = db.prepare(`
    SELECT
      checkpoint_id as "commit",
      repo,
      agent_percentage as agentPercentage,
      committed_at as committedAt
    FROM repo_checkpoints
    WHERE agent_percentage IS NOT NULL
    ORDER BY committed_at
  `);
  const slashCommandsStmt = db.prepare('SELECT slash_commands_json FROM session_repo_touches');
  const toolUsageStmt = db.prepare('SELECT tool_calls_json FROM session_repo_touches');
  const frictionStmt = db.prepare(`
    SELECT session_id as sessionId, friction_count as count, friction_json
    FROM sessions
    ORDER BY friction_count DESC
  `);
  const openItemsStmt = db.prepare(`
    SELECT session_id as sessionId, open_items_count as count, open_items_json
    FROM sessions
    ORDER BY open_items_count DESC
  `);

  // Chart 1: Sessions Over Time
  router.get('/charts/sessions-over-time', (_req, res) => {
    try {
      res.json(sessionsOverTimeStmt.all());
    } catch (err) {
      log('error', 'Chart sessions-over-time failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to load chart data' });
    }
  });

  // Chart 4: Agent % per Commit
  router.get('/charts/agent-percentage', (_req, res) => {
    try {
      res.json(agentPercentageStmt.all());
    } catch (err) {
      log('error', 'Chart agent-percentage failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to load chart data' });
    }
  });

  // Chart 14: Slash Command Frequency
  router.get('/charts/slash-commands', (_req, res) => {
    try {
      const touches = slashCommandsStmt.all() as { slash_commands_json: string }[];
      const counts = new Map<string, number>();
      for (const row of touches) {
        const cmds: string[] = safeJsonParse(row.slash_commands_json, []);
        for (const cmd of cmds) {
          counts.set(cmd, (counts.get(cmd) || 0) + 1);
        }
      }
      const result = [...counts.entries()]
        .map(([command, count]) => ({ command, count }))
        .sort((a, b) => b.count - a.count);
      res.json(result);
    } catch (err) {
      log('error', 'Chart slash-commands failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to load chart data' });
    }
  });

  // Chart 21: Tool Usage Mix
  router.get('/charts/tool-usage', (_req, res) => {
    try {
      const touches = toolUsageStmt.all() as { tool_calls_json: string }[];
      const counts = new Map<string, number>();
      for (const row of touches) {
        const tools: Record<string, number> = safeJsonParse(row.tool_calls_json, {});
        for (const [tool, count] of Object.entries(tools)) {
          counts.set(tool, (counts.get(tool) || 0) + count);
        }
      }
      const result = [...counts.entries()]
        .map(([tool, count]) => ({ tool, count }))
        .sort((a, b) => b.count - a.count);
      res.json(result);
    } catch (err) {
      log('error', 'Chart tool-usage failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to load chart data' });
    }
  });

  // Chart 25: Friction per Session
  router.get('/charts/friction', (_req, res) => {
    try {
      const rows = frictionStmt.all() as { sessionId: string; count: number; friction_json: string | null }[];
      const result = rows.map((r) => ({
        sessionId: r.sessionId,
        count: r.count,
        items: r.friction_json ? safeJsonParse(r.friction_json, []) : [],
      }));
      res.json(result);
    } catch (err) {
      log('error', 'Chart friction failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to load chart data' });
    }
  });

  // Chart 26: Open Items per Session
  router.get('/charts/open-items', (_req, res) => {
    try {
      const rows = openItemsStmt.all() as { sessionId: string; count: number; open_items_json: string | null }[];
      const result = rows.map((r) => ({
        sessionId: r.sessionId,
        count: r.count,
        items: r.open_items_json ? safeJsonParse(r.open_items_json, []) : [],
      }));
      res.json(result);
    } catch (err) {
      log('error', 'Chart open-items failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to load chart data' });
    }
  });

  // Chart: Avg Files Touched per Session
  const filesPerSessionStmt = db.prepare(`
    SELECT session_id as sessionId, SUM(json_array_length(files_touched_json)) as filesCount
    FROM session_repo_touches
    GROUP BY session_id
    ORDER BY filesCount DESC
  `);

  router.get('/charts/files-per-session', (_req, res) => {
    try {
      res.json(filesPerSessionStmt.all());
    } catch (err) {
      log('error', 'Chart files-per-session failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to load chart data' });
    }
  });

  // Summary endpoint for cross-repo validation
  router.get('/charts/summary', (_req, res) => {
    res.json({ totalEndpoints: 10, description: "Cross-repo validation test" });
  });

  return router;
}
