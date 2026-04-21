import { config } from '../config.js';
import { fetchCheckpointBranch } from './checkpoint-fetcher.js';
import { parseMetadata } from './metadata-parser.js';
import { parseJsonl } from './jsonl-parser.js';
import { computeLinks } from '../domain/session-joiner.js';
import { createSessionsRepo } from '../db/sessions-repo.js';
import { createRepoCheckpointsRepo } from '../db/repo-checkpoints-repo.js';
import { createSessionTouchesRepo } from '../db/session-touches-repo.js';
import { createSessionLinksRepo } from '../db/session-links-repo.js';
import { log } from '../utils/logger.js';
import type Database from 'better-sqlite3';
import type { SessionRow, RepoCheckpointRow } from '../db/types.js';

export interface IngestionReport {
  sessions: number;
  checkpoints: number;
  links: number;
  errors: string[];
}

function mapToJson(map: Map<string, number>): string {
  return JSON.stringify(Object.fromEntries(map));
}

function setToJson(set: Set<string>): string {
  return JSON.stringify([...set]);
}

export async function runIngestion(db: Database.Database): Promise<IngestionReport> {
  const knownRepos = new Set(config.allRepos);
  const sessionsRepo = createSessionsRepo(db);
  const checkpointsRepo = createRepoCheckpointsRepo(db);
  const touchesRepo = createSessionTouchesRepo(db);
  const linksRepo = createSessionLinksRepo(db);

  const errors: string[] = [];
  let sessionCount = 0;
  let checkpointCount = 0;

  for (const repo of config.allRepos) {
    try {
      const checkpoints = await fetchCheckpointBranch(config.GITHUB_OWNER, repo);

      for (const ckpt of checkpoints) {
        const metadata = parseMetadata(ckpt.metadataJson);

        // Store checkpoint as a repo checkpoint
        checkpointsRepo.upsert({
          repo,
          checkpoint_id: ckpt.checkpointId,
          commit_sha: metadata.commitSha,
          committed_at: metadata.committedAt,
          agent_percentage: metadata.agentPercentage,
          agent_lines: metadata.agentLines,
          human_added: metadata.humanAdded,
          human_modified: metadata.humanModified,
          human_removed: metadata.humanRemoved,
          files_touched_json: JSON.stringify(metadata.filesTouched),
          session_id_in_metadata: metadata.sessionId,
        });
        checkpointCount++;

        // Parse session files (from workspace transcripts)
        for (const sf of ckpt.sessionFiles) {
          const parsed = parseJsonl(sf.jsonlText, {
            knownRepos,
            sessionIdOverride: sf.sessionId,
          });

          const sessionId = parsed.sessionId || sf.sessionId;

          // Upsert session
          sessionsRepo.upsert({
            session_id: sessionId,
            workspace_checkpoint_id: repo === config.WORKSPACE_REPO ? ckpt.checkpointId : null,
            started_at: parsed.startedAt || new Date().toISOString(),
            ended_at: parsed.endedAt,
            agent: parsed.agent || metadata.agent,
            model: parsed.model || metadata.model,
            total_input_tokens: parsed.totalInputTokens,
            total_output_tokens: parsed.totalOutputTokens,
            total_cache_read_tokens: parsed.totalCacheReadTokens,
            friction_count: metadata.summary?.friction.length ?? 0,
            open_items_count: metadata.summary?.openItems.length ?? 0,
            learnings_json: metadata.summary?.learnings
              ? JSON.stringify(metadata.summary.learnings)
              : null,
            friction_json: metadata.summary?.friction
              ? JSON.stringify(metadata.summary.friction)
              : null,
            open_items_json: metadata.summary?.openItems
              ? JSON.stringify(metadata.summary.openItems)
              : null,
            raw_metadata_path: ckpt.metadataJson ? `${repo}/${ckpt.checkpointId}/metadata.json` : null,
          });
          sessionCount++;

          // Upsert repo touches
          for (const [touchedRepo, files] of parsed.filesTouchedByRepo) {
            touchesRepo.upsert({
              session_id: sessionId,
              repo: touchedRepo,
              files_touched_json: setToJson(files),
              tool_calls_json: mapToJson(parsed.toolCallsByRepo.get(touchedRepo) || new Map()),
              slash_commands_json: setToJson(parsed.slashCommandsByRepo.get(touchedRepo) || new Set()),
              subagent_count: parsed.subagentCountByRepo.get(touchedRepo) || 0,
            });
          }
        }
      }
    } catch (err) {
      const errObj = err as { status?: number; message?: string; request?: { url?: string } };
      const msg = `Error ingesting ${repo}: ${err}`;
      console.error('[INGESTION ERROR]', repo, {
        message: errObj.message,
        status: errObj.status,
        url: errObj.request?.url,
      });
      log('error', msg);
      errors.push(msg);
    }
  }

  // Recompute all joins
  linksRepo.clearAll();
  const allSessions = sessionsRepo.getAll();
  const allCheckpoints = checkpointsRepo.getAll();
  const allTouches = touchesRepo.getAll();
  let linkCount = 0;

  for (const session of allSessions) {
    // Gather all files touched by this session across repos
    const sessionTouches = allTouches.filter((t) => t.session_id === session.session_id);
    const filesTouched = new Set<string>();
    for (const touch of sessionTouches) {
      const files: string[] = JSON.parse(touch.files_touched_json);
      for (const f of files) filesTouched.add(f);
    }

    const links = computeLinks(
      session as SessionRow,
      filesTouched,
      allCheckpoints as readonly RepoCheckpointRow[],
    );

    for (const link of links) {
      linksRepo.upsert({
        session_id: link.sessionId,
        repo: link.repo,
        checkpoint_id: link.checkpointId,
        confidence: link.confidence,
        join_reason: link.joinReason,
        confidence_score: link.confidenceScore,
      });
      linkCount++;
    }
  }

  log('info', 'Ingestion complete', { sessions: sessionCount, checkpoints: checkpointCount, links: linkCount });
  return { sessions: sessionCount, checkpoints: checkpointCount, links: linkCount, errors };
}
