import type Database from 'better-sqlite3';
import type { GitAiCommitAttributionRow } from './types.js';

export function createGitAiRepo(db: Database.Database) {
  const upsertStmt = db.prepare(`
    INSERT INTO gitai_commit_attribution
      (repo, commit_sha, agent, model, agent_lines, human_lines, agent_percentage,
       prompt_id, files_touched_json, raw_note_json, captured_at)
    VALUES
      (@repo, @commit_sha, @agent, @model, @agent_lines, @human_lines, @agent_percentage,
       @prompt_id, @files_touched_json, @raw_note_json, @captured_at)
    ON CONFLICT (repo, commit_sha, agent) DO UPDATE SET
      model = COALESCE(@model, model),
      agent_lines = @agent_lines,
      human_lines = @human_lines,
      agent_percentage = @agent_percentage,
      prompt_id = COALESCE(@prompt_id, prompt_id),
      files_touched_json = COALESCE(@files_touched_json, files_touched_json),
      raw_note_json = COALESCE(@raw_note_json, raw_note_json),
      captured_at = COALESCE(@captured_at, captured_at)
  `);

  const getAllStmt = db.prepare(
    'SELECT * FROM gitai_commit_attribution ORDER BY captured_at DESC',
  );

  const getByRepoStmt = db.prepare(
    'SELECT * FROM gitai_commit_attribution WHERE repo = ? ORDER BY captured_at DESC',
  );

  const getByShaStmt = db.prepare(
    'SELECT * FROM gitai_commit_attribution WHERE commit_sha = ?',
  );

  const summaryByRepoStmt = db.prepare(`
    SELECT repo, COUNT(*) AS commits,
           AVG(agent_percentage) AS avg_agent_pct,
           SUM(agent_lines) AS total_agent_lines,
           SUM(human_lines) AS total_human_lines
    FROM gitai_commit_attribution
    GROUP BY repo
  `);

  const summaryByAgentStmt = db.prepare(`
    SELECT agent, COUNT(*) AS commits, AVG(agent_percentage) AS avg_pct
    FROM gitai_commit_attribution
    GROUP BY agent
  `);

  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM gitai_commit_attribution');

  return {
    upsert(row: Omit<GitAiCommitAttributionRow, 'ingested_at'>) {
      upsertStmt.run(row);
    },
    getAll(): GitAiCommitAttributionRow[] {
      return getAllStmt.all() as GitAiCommitAttributionRow[];
    },
    getByRepo(repo: string): GitAiCommitAttributionRow[] {
      return getByRepoStmt.all(repo) as GitAiCommitAttributionRow[];
    },
    getBySha(sha: string): GitAiCommitAttributionRow[] {
      return getByShaStmt.all(sha) as GitAiCommitAttributionRow[];
    },
    summaryByRepo() {
      return summaryByRepoStmt.all() as { repo: string; commits: number; avg_agent_pct: number; total_agent_lines: number; total_human_lines: number }[];
    },
    summaryByAgent() {
      return summaryByAgentStmt.all() as { agent: string; commits: number; avg_pct: number }[];
    },
    count(): number {
      return (countStmt.get() as { n: number }).n;
    },
  };
}
