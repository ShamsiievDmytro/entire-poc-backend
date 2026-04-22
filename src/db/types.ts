export interface SessionRow {
  session_id: string;
  workspace_checkpoint_id: string | null;
  started_at: string;
  ended_at: string | null;
  agent: string | null;
  model: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  friction_count: number;
  open_items_count: number;
  learnings_json: string | null;
  friction_json: string | null;
  open_items_json: string | null;
  raw_metadata_path: string | null;
}

export interface SessionRepoTouchRow {
  id: number;
  session_id: string;
  repo: string;
  files_touched_json: string;
  tool_calls_json: string;
  slash_commands_json: string;
  subagent_count: number;
}

export interface RepoCheckpointRow {
  repo: string;
  checkpoint_id: string;
  commit_sha: string | null;
  committed_at: string | null;
  agent_percentage: number | null;
  agent_lines: number | null;
  human_added: number | null;
  human_modified: number | null;
  human_removed: number | null;
  files_touched_json: string | null;
  session_id_in_metadata: string | null;
}

export interface SessionCommitLinkRow {
  id: number;
  session_id: string;
  repo: string;
  checkpoint_id: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  join_reason: string;
  confidence_score: number;
  created_at: string;
}

export interface GitAiCommitAttributionRow {
  repo: string;
  commit_sha: string;
  agent: string;
  model: string | null;
  agent_lines: number;
  human_lines: number;
  overridden_lines: number;
  agent_percentage: number;
  prompt_id: string | null;
  commit_author: string | null;
  commit_message: string | null;
  diff_additions: number;
  diff_deletions: number;
  files_touched_json: string | null;
  raw_note_json: string | null;
  captured_at: string | null;
  ingested_at: string;
}
