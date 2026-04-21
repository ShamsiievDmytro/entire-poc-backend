import type Database from 'better-sqlite3';
import type { SessionRow } from './types.js';

export function createSessionsRepo(db: Database.Database) {
  const upsert = db.prepare(`
    INSERT INTO sessions (
      session_id, workspace_checkpoint_id, started_at, ended_at,
      agent, model, total_input_tokens, total_output_tokens, total_cache_read_tokens,
      friction_count, open_items_count, learnings_json, friction_json, open_items_json, raw_metadata_path
    ) VALUES (
      @session_id, @workspace_checkpoint_id, @started_at, @ended_at,
      @agent, @model, @total_input_tokens, @total_output_tokens, @total_cache_read_tokens,
      @friction_count, @open_items_count, @learnings_json, @friction_json, @open_items_json, @raw_metadata_path
    ) ON CONFLICT(session_id) DO UPDATE SET
      workspace_checkpoint_id = COALESCE(excluded.workspace_checkpoint_id, sessions.workspace_checkpoint_id),
      ended_at = COALESCE(excluded.ended_at, sessions.ended_at),
      agent = COALESCE(excluded.agent, sessions.agent),
      model = COALESCE(excluded.model, sessions.model),
      total_input_tokens = MAX(excluded.total_input_tokens, sessions.total_input_tokens),
      total_output_tokens = MAX(excluded.total_output_tokens, sessions.total_output_tokens),
      total_cache_read_tokens = MAX(excluded.total_cache_read_tokens, sessions.total_cache_read_tokens),
      friction_count = COALESCE(excluded.friction_count, sessions.friction_count),
      open_items_count = COALESCE(excluded.open_items_count, sessions.open_items_count),
      learnings_json = COALESCE(excluded.learnings_json, sessions.learnings_json),
      friction_json = COALESCE(excluded.friction_json, sessions.friction_json),
      open_items_json = COALESCE(excluded.open_items_json, sessions.open_items_json),
      raw_metadata_path = COALESCE(excluded.raw_metadata_path, sessions.raw_metadata_path)
  `);

  const getAll = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC');
  const getById = db.prepare('SELECT * FROM sessions WHERE session_id = ?');

  return {
    upsert: (row: SessionRow) => upsert.run(row),
    getAll: () => getAll.all() as SessionRow[],
    getById: (id: string) => getById.get(id) as SessionRow | undefined,
  };
}
