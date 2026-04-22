import { Router } from 'express';
import type Database from 'better-sqlite3';
import { createGitAiRepo } from '../../db/gitai-repo.js';
import { getPromptById, getFullTranscript } from '../../db/gitai-local-reader.js';
import { log } from '../../utils/logger.js';

export function classifyFileLayer(filePath: string): string {
  if (/components\/|pages\//.test(filePath)) return 'components';
  if (/routes\/|api\//.test(filePath)) return 'routes';
  if (/utils\/|lib\/|domain\//.test(filePath)) return 'utils';
  if (/tests\/|test\/|\.test\.|\.spec\./.test(filePath)) return 'tests';
  if (/docs\/|\.md$/.test(filePath)) return 'docs';
  if (/db\/|migrations\//.test(filePath)) return 'database';
  if (/ingestion\//.test(filePath)) return 'ingestion';
  return 'other';
}

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

  // GET /api/gitai/commits/:sha/detail — full commit detail with local prompt data
  router.get('/gitai/commits/:sha/detail', (req, res) => {
    const rows = gitaiRepo.getBySha(req.params.sha);
    if (rows.length === 0) {
      res.status(404).json({ error: 'No Git AI attribution found for this commit' });
      return;
    }

    const row = rows[0];
    const files: unknown[] = [];
    for (const r of rows) {
      try { files.push(...JSON.parse(r.files_touched_json ?? '[]')); }
      catch { /* skip malformed */ }
    }

    const localPrompt = row.prompt_id ? getPromptById(row.prompt_id) : null;

    res.json({
      commit_sha: row.commit_sha,
      repo: row.repo,
      captured_at: row.captured_at,
      attribution: {
        agent: row.agent,
        model: row.model,
        agent_lines: row.agent_lines,
        human_lines: row.human_lines,
        agent_percentage: row.agent_percentage,
        prompt_id: row.prompt_id,
      },
      files,
      raw_note: row.raw_note_json,
      local_prompt: localPrompt,
    });
  });

  // GET /api/gitai/commits/:sha/transcript — download full transcript
  router.get('/gitai/commits/:sha/transcript', (req, res) => {
    const promptId = req.query.prompt_id as string;
    if (!promptId) {
      res.status(400).json({ error: 'prompt_id query parameter required' });
      return;
    }

    const transcript = getFullTranscript(promptId);
    if (!transcript) {
      res.status(404).json({ error: 'Transcript not found for this prompt' });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${promptId}.json`);
    res.send(transcript);
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

  // GET /api/gitai/dashboard — all aggregated data for the dashboard
  router.get('/gitai/dashboard', (_req, res) => {
    log('info', 'GET /api/gitai/dashboard');
    const rows = gitaiRepo.getAll();

    // --- summary ---
    const total_commits = rows.length;
    const avg_agent_pct =
      total_commits > 0
        ? rows.reduce((sum, r) => sum + r.agent_percentage, 0) / total_commits
        : 0;

    const pure_ai_count = rows.filter((r) => r.agent_percentage === 100).length;
    const pure_ai_commit_rate =
      total_commits > 0 ? (pure_ai_count / total_commits) * 100 : 0;

    // first_time_right: skip commits with agent_lines=0, check overriden_lines in prompts
    let ftrEligible = 0;
    let ftrPassed = 0;
    for (const r of rows) {
      if (r.agent_lines === 0) continue;
      ftrEligible++;
      try {
        const raw = r.raw_note_json ?? '';
        const parts = raw.split('\n---\n');
        // find the JSON part (last non-empty chunk, or the only one)
        let parsed: { prompts?: Record<string, { overriden_lines?: number }> } | null = null;
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i].trim();
          if (part.startsWith('{')) {
            parsed = JSON.parse(part) as { prompts?: Record<string, { overriden_lines?: number }> };
            break;
          }
        }
        if (parsed === null) {
          ftrPassed++;
        } else {
          const promptValues = Object.values(parsed.prompts ?? {});
          const allZero = promptValues.every((p) => (p.overriden_lines ?? 0) === 0);
          if (allZero) ftrPassed++;
        }
      } catch {
        // parse failure → count as first-time-right
        ftrPassed++;
      }
    }
    const first_time_right_rate =
      ftrEligible > 0 ? (ftrPassed / ftrEligible) * 100 : 0;

    const total_ai_lines = rows.reduce((sum, r) => sum + r.agent_lines, 0);
    const total_human_lines = rows.reduce((sum, r) => sum + r.human_lines, 0);

    const summary = {
      total_commits,
      avg_agent_pct,
      pure_ai_commit_rate,
      first_time_right_rate,
      total_ai_lines,
      total_human_lines,
    };

    // --- agent_pct_over_time (sorted ASC) ---
    const sortedAsc = [...rows].sort((a, b) =>
      (a.captured_at ?? '').localeCompare(b.captured_at ?? ''),
    );

    const agent_pct_over_time = sortedAsc.map((r) => ({
      commit_sha: r.commit_sha,
      repo: r.repo,
      agent_percentage: r.agent_percentage,
      captured_at: r.captured_at,
    }));

    // --- attribution_breakdown (sorted ASC) ---
    const attribution_breakdown = sortedAsc.map((r) => ({
      commit_sha: r.commit_sha,
      repo: r.repo,
      agent_lines: r.agent_lines,
      human_lines: r.human_lines,
      captured_at: r.captured_at,
    }));

    // --- by_developer ---
    const devMap = new Map<string, { sum: number; count: number }>();
    for (const r of rows) {
      const author = r.commit_author ?? 'unknown';
      const existing = devMap.get(author) ?? { sum: 0, count: 0 };
      devMap.set(author, { sum: existing.sum + r.agent_percentage, count: existing.count + 1 });
    }
    const by_developer = Array.from(devMap.entries()).map(([author, { sum, count }]) => ({
      author,
      commits: count,
      avg_agent_pct: Math.round(sum / count * 10) / 10,
    }));

    // --- by_model ---
    const modelMap = new Map<string, number>();
    for (const r of rows) {
      const model = r.model ?? 'unknown';
      modelMap.set(model, (modelMap.get(model) ?? 0) + 1);
    }
    const by_model = Array.from(modelMap.entries()).map(([model, commits]) => ({
      model,
      commits,
    }));

    // --- files_by_layer ---
    const layerMap = new Map<string, { ai_lines: number; human_lines: number }>();
    for (const r of rows) {
      try {
        const files = JSON.parse(r.files_touched_json ?? '[]') as Array<{
          file?: string;
          lineCount?: number;
        }>;
        for (const f of files) {
          const layer = classifyFileLayer(f.file ?? '');
          const entry = layerMap.get(layer) ?? { ai_lines: 0, human_lines: 0 };
          entry.ai_lines += f.lineCount ?? 0;
          layerMap.set(layer, entry);
        }
      } catch {
        // skip malformed
      }
    }
    const files_by_layer = Array.from(layerMap.entries())
      .map(([layer, d]) => ({ layer, ai_lines: d.ai_lines, human_lines: d.human_lines }))
      .sort((a, b) => b.ai_lines - a.ai_lines);

    // --- ai_human_rate_by_day ---
    const dayMap = new Map<string, { ai_lines: number; human_lines: number }>();
    for (const r of sortedAsc) {
      const day = r.captured_at ? r.captured_at.slice(0, 10) : 'unknown';
      const entry = dayMap.get(day) ?? { ai_lines: 0, human_lines: 0 };
      entry.ai_lines += r.agent_lines;
      entry.human_lines += r.human_lines;
      dayMap.set(day, entry);
    }
    const ai_human_rate_by_day = Array.from(dayMap.entries())
      .filter(([day]) => day !== 'unknown')
      .map(([day, d]) => {
        const total = d.ai_lines + d.human_lines;
        return {
          day,
          ai_lines: d.ai_lines,
          human_lines: d.human_lines,
          ai_pct: total > 0 ? Math.round(d.ai_lines / total * 1000) / 10 : 0,
          human_pct: total > 0 ? Math.round(d.human_lines / total * 1000) / 10 : 0,
        };
      });

    // --- commit_cadence ---
    const commit_cadence: Array<{ commit_sha: string; hours_since_prev: number; captured_at: string | null }> = [];
    for (let i = 1; i < sortedAsc.length; i++) {
      const prev = sortedAsc[i - 1];
      const curr = sortedAsc[i];
      const prevMs = prev.captured_at ? new Date(prev.captured_at).getTime() : NaN;
      const currMs = curr.captured_at ? new Date(curr.captured_at).getTime() : NaN;
      const hours_since_prev = isNaN(prevMs) || isNaN(currMs) ? 0 : (currMs - prevMs) / 3_600_000;
      commit_cadence.push({
        commit_sha: curr.commit_sha,
        hours_since_prev,
        captured_at: curr.captured_at,
      });
    }

    res.json({
      summary,
      agent_pct_over_time,
      attribution_breakdown,
      by_developer,
      by_model,
      ai_human_rate_by_day,
      commit_cadence,
    });
  });

  return router;
}
