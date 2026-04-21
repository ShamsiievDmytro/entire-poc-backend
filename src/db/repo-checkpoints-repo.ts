import type Database from 'better-sqlite3';
import type { RepoCheckpointRow } from './types.js';

export function createRepoCheckpointsRepo(db: Database.Database) {
  const upsert = db.prepare(`
    INSERT INTO repo_checkpoints (
      repo, checkpoint_id, commit_sha, committed_at,
      agent_percentage, agent_lines, human_added, human_modified, human_removed,
      files_touched_json, session_id_in_metadata
    ) VALUES (
      @repo, @checkpoint_id, @commit_sha, @committed_at,
      @agent_percentage, @agent_lines, @human_added, @human_modified, @human_removed,
      @files_touched_json, @session_id_in_metadata
    ) ON CONFLICT(repo, checkpoint_id) DO UPDATE SET
      commit_sha = COALESCE(excluded.commit_sha, repo_checkpoints.commit_sha),
      committed_at = COALESCE(excluded.committed_at, repo_checkpoints.committed_at),
      agent_percentage = COALESCE(excluded.agent_percentage, repo_checkpoints.agent_percentage),
      agent_lines = COALESCE(excluded.agent_lines, repo_checkpoints.agent_lines),
      human_added = COALESCE(excluded.human_added, repo_checkpoints.human_added),
      human_modified = COALESCE(excluded.human_modified, repo_checkpoints.human_modified),
      human_removed = COALESCE(excluded.human_removed, repo_checkpoints.human_removed),
      files_touched_json = COALESCE(excluded.files_touched_json, repo_checkpoints.files_touched_json),
      session_id_in_metadata = COALESCE(excluded.session_id_in_metadata, repo_checkpoints.session_id_in_metadata)
  `);

  const getAll = db.prepare('SELECT * FROM repo_checkpoints ORDER BY committed_at DESC');
  const getByRepo = db.prepare('SELECT * FROM repo_checkpoints WHERE repo = ? ORDER BY committed_at DESC');

  return {
    upsert: (row: RepoCheckpointRow) => upsert.run(row),
    getAll: () => getAll.all() as RepoCheckpointRow[],
    getByRepo: (repo: string) => getByRepo.all(repo) as RepoCheckpointRow[],
  };
}
