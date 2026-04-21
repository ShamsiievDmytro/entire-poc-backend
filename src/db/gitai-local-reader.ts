// src/db/gitai-local-reader.ts
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

export interface LocalPromptRecord {
  prompt_id: string;
  session_id: string;
  workdir: string | null;
  tool: string;
  model: string;
  human_author: string | null;
  total_additions: number | null;
  total_deletions: number | null;
  accepted_lines: number | null;
  overridden_lines: number | null;
  message_preview: string | null;
  message_bytes: number;
  created_at: string;
  updated_at: string;
}

let instance: Database.Database | null = null;
let initAttempted = false;

function getLocalDb(): Database.Database | null {
  if (initAttempted) return instance;
  initAttempted = true;

  const dbPath = config.GITAI_LOCAL_DB_PATH;
  if (!existsSync(dbPath)) {
    log('warn', 'Git AI local DB not found, local prompt data unavailable', { path: dbPath });
    return null;
  }

  try {
    instance = new Database(dbPath, { readonly: true });
    log('info', 'Opened Git AI local DB (read-only)', { path: dbPath });
    return instance;
  } catch (err) {
    log('error', 'Failed to open Git AI local DB', { path: dbPath, error: String(err) });
    return null;
  }
}

export function getPromptById(promptId: string): LocalPromptRecord | null {
  const db = getLocalDb();
  if (!db) return null;

  try {
    const row = db.prepare(`
      SELECT
        id AS prompt_id,
        external_thread_id AS session_id,
        workdir,
        tool,
        model,
        human_author,
        total_additions,
        total_deletions,
        accepted_lines,
        overridden_lines,
        substr(messages, 1, 500) AS message_preview,
        length(messages) AS message_bytes,
        created_at,
        updated_at
      FROM prompts
      WHERE id = ?
    `).get(promptId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      prompt_id: row.prompt_id as string,
      session_id: row.session_id as string,
      workdir: row.workdir as string | null,
      tool: row.tool as string,
      model: row.model as string,
      human_author: row.human_author as string | null,
      total_additions: row.total_additions as number | null,
      total_deletions: row.total_deletions as number | null,
      accepted_lines: row.accepted_lines as number | null,
      overridden_lines: row.overridden_lines as number | null,
      message_preview: row.message_preview as string | null,
      message_bytes: row.message_bytes as number,
      created_at: new Date((row.created_at as number) * 1000).toISOString(),
      updated_at: new Date((row.updated_at as number) * 1000).toISOString(),
    };
  } catch (err) {
    log('error', 'Failed to query local prompt', { promptId, error: String(err) });
    return null;
  }
}

export function getFullTranscript(promptId: string): string | null {
  const db = getLocalDb();
  if (!db) return null;

  try {
    const row = db.prepare('SELECT messages FROM prompts WHERE id = ?').get(promptId) as { messages: string } | undefined;
    return row?.messages ?? null;
  } catch (err) {
    log('error', 'Failed to fetch transcript', { promptId, error: String(err) });
    return null;
  }
}
