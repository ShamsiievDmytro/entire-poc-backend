CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  workspace_checkpoint_id TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  agent TEXT,
  model TEXT,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cache_read_tokens INTEGER DEFAULT 0,
  friction_count INTEGER DEFAULT 0,
  open_items_count INTEGER DEFAULT 0,
  learnings_json TEXT,
  friction_json TEXT,
  open_items_json TEXT,
  raw_metadata_path TEXT
);

CREATE TABLE IF NOT EXISTS session_repo_touches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  files_touched_json TEXT NOT NULL,
  tool_calls_json TEXT NOT NULL,
  slash_commands_json TEXT NOT NULL,
  subagent_count INTEGER DEFAULT 0,
  UNIQUE (session_id, repo),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS repo_checkpoints (
  repo TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  commit_sha TEXT,
  committed_at TIMESTAMP,
  agent_percentage REAL,
  agent_lines INTEGER,
  human_added INTEGER,
  human_modified INTEGER,
  human_removed INTEGER,
  files_touched_json TEXT,
  session_id_in_metadata TEXT,
  PRIMARY KEY (repo, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS session_commit_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  join_reason TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, repo, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS gitai_commit_attribution (
  repo TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  agent TEXT NOT NULL,
  model TEXT,
  agent_lines INTEGER NOT NULL,
  human_lines INTEGER NOT NULL,
  agent_percentage REAL NOT NULL,
  prompt_id TEXT,
  commit_author TEXT,
  commit_message TEXT,
  diff_additions INTEGER DEFAULT 0,
  diff_deletions INTEGER DEFAULT 0,
  files_touched_json TEXT,
  raw_note_json TEXT,
  captured_at TIMESTAMP,
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repo, commit_sha, agent)
);

CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_repo_checkpoints_committed_at ON repo_checkpoints(committed_at);
CREATE INDEX IF NOT EXISTS idx_session_repo_touches_repo ON session_repo_touches(repo);
CREATE INDEX IF NOT EXISTS idx_gitai_committed_at ON gitai_commit_attribution(captured_at);
CREATE INDEX IF NOT EXISTS idx_gitai_repo ON gitai_commit_attribution(repo);
