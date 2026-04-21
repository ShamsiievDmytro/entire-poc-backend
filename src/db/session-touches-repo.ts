import type Database from 'better-sqlite3';
import type { SessionRepoTouchRow } from './types.js';

export function createSessionTouchesRepo(db: Database.Database) {
  const upsert = db.prepare(`
    INSERT INTO session_repo_touches (
      session_id, repo, files_touched_json, tool_calls_json, slash_commands_json, subagent_count
    ) VALUES (
      @session_id, @repo, @files_touched_json, @tool_calls_json, @slash_commands_json, @subagent_count
    ) ON CONFLICT(session_id, repo) DO UPDATE SET
      files_touched_json = excluded.files_touched_json,
      tool_calls_json = excluded.tool_calls_json,
      slash_commands_json = excluded.slash_commands_json,
      subagent_count = excluded.subagent_count
  `);

  const getBySessionId = db.prepare('SELECT * FROM session_repo_touches WHERE session_id = ?');
  const getAll = db.prepare('SELECT * FROM session_repo_touches');

  return {
    upsert: (row: Omit<SessionRepoTouchRow, 'id'>) => upsert.run(row),
    getBySessionId: (sessionId: string) => getBySessionId.all(sessionId) as SessionRepoTouchRow[],
    getAll: () => getAll.all() as SessionRepoTouchRow[],
  };
}
