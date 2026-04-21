import type Database from 'better-sqlite3';
import type { SessionCommitLinkRow } from './types.js';

export function createSessionLinksRepo(db: Database.Database) {
  const upsert = db.prepare(`
    INSERT INTO session_commit_links (
      session_id, repo, checkpoint_id, confidence, join_reason, confidence_score
    ) VALUES (
      @session_id, @repo, @checkpoint_id, @confidence, @join_reason, @confidence_score
    ) ON CONFLICT(session_id, repo, checkpoint_id) DO UPDATE SET
      confidence = excluded.confidence,
      join_reason = excluded.join_reason,
      confidence_score = excluded.confidence_score
  `);

  const getAll = db.prepare('SELECT * FROM session_commit_links ORDER BY created_at DESC');
  const getBySessionId = db.prepare('SELECT * FROM session_commit_links WHERE session_id = ?');
  const clearAll = db.prepare('DELETE FROM session_commit_links');

  return {
    upsert: (row: Omit<SessionCommitLinkRow, 'id' | 'created_at'>) => upsert.run(row),
    getAll: () => getAll.all() as SessionCommitLinkRow[],
    getBySessionId: (sessionId: string) => getBySessionId.all(sessionId) as SessionCommitLinkRow[],
    clearAll: () => clearAll.run(),
  };
}
