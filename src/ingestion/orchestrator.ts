import { config } from '../config.js';
import { fetchCheckpointBranch } from './checkpoint-fetcher.js';
import { parseMetadata } from './metadata-parser.js';
import { parseJsonl } from './jsonl-parser.js';
import { computeLinks, computeTranscriptLinks } from '../domain/session-joiner.js';
import { fetchRepoCommitsInWindow } from './github-client.js';
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

  // Pattern A*: Only fetch checkpoints from the workspace repo.
  // Service repos no longer have Entire enabled; their data is derived
  // from the workspace transcript's filePath events.
  const workspaceRepo = config.WORKSPACE_REPO;

  try {
    const checkpoints = await fetchCheckpointBranch(config.GITHUB_OWNER, workspaceRepo);

    for (const ckpt of checkpoints) {
      const metadata = parseMetadata(ckpt.metadataJson);

      // Store workspace checkpoint
      checkpointsRepo.upsert({
        repo: workspaceRepo,
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

      // Parse session files (workspace transcripts contain cross-repo filePath events)
      for (const sf of ckpt.sessionFiles) {
        const parsed = parseJsonl(sf.jsonlText, {
          knownRepos,
          sessionIdOverride: sf.sessionId,
        });

        const sessionId = parsed.sessionId || sf.sessionId;

        // Upsert session
        sessionsRepo.upsert({
          session_id: sessionId,
          workspace_checkpoint_id: ckpt.checkpointId,
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
          raw_metadata_path: ckpt.metadataJson ? `${workspaceRepo}/${ckpt.checkpointId}/metadata.json` : null,
        });
        sessionCount++;

        // Upsert repo touches (derived from workspace transcript's filePath events)
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
    const msg = `Error ingesting workspace: ${err}`;
    log('error', msg, {
      repo: workspaceRepo,
      message: errObj.message,
      status: errObj.status,
      url: errObj.request?.url,
    });
    errors.push(msg);
  }

  // Recompute all session-to-commit links
  linksRepo.clearAll();
  const allSessions = sessionsRepo.getAll();
  const allCheckpoints = checkpointsRepo.getAll();
  const allTouches = touchesRepo.getAll();
  let linkCount = 0;

  for (const session of allSessions) {
    const sessionTouches = allTouches.filter((t) => t.session_id === session.session_id);

    // 1. Workspace self-links (original checkpoint-based approach)
    const allFilesTouched = new Set<string>();
    for (const touch of sessionTouches) {
      let files: string[];
      try {
        files = JSON.parse(touch.files_touched_json);
      } catch {
        log('warn', 'Corrupt files_touched_json in session touch', { session_id: session.session_id, repo: touch.repo });
        continue;
      }
      for (const f of files) allFilesTouched.add(f);
    }

    const workspaceLinks = computeLinks(
      session as SessionRow,
      allFilesTouched,
      allCheckpoints as readonly RepoCheckpointRow[],
    );

    for (const link of workspaceLinks) {
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

    // 2. Transcript-first linking for service repos:
    // Fetch actual commits from GitHub for each service repo touched,
    // then match by timestamp + file overlap.
    if (!session.started_at) continue;

    const sessionStart = new Date(session.started_at);
    const sessionEnd = session.ended_at ? new Date(session.ended_at) : sessionStart;

    // Expand window by ±15 min for the API query
    const FIFTEEN_MIN_MS = 15 * 60 * 1000;
    const since = new Date(sessionStart.getTime() - FIFTEEN_MIN_MS).toISOString();
    const until = new Date(sessionEnd.getTime() + FIFTEEN_MIN_MS).toISOString();

    for (const touch of sessionTouches) {
      // Skip workspace — already handled by checkpoint-based links above
      if (touch.repo === workspaceRepo) continue;

      let repoFiles: string[];
      try {
        repoFiles = JSON.parse(touch.files_touched_json);
      } catch {
        log('warn', 'Corrupt files_touched_json in session touch', { session_id: session.session_id, repo: touch.repo });
        continue;
      }
      const repoFileSet = new Set(repoFiles);

      try {
        const commits = await fetchRepoCommitsInWindow(
          config.GITHUB_OWNER,
          touch.repo,
          since,
          until,
        );

        const transcriptLinks = computeTranscriptLinks(
          session as SessionRow,
          repoFileSet,
          touch.repo,
          commits,
        );

        for (const link of transcriptLinks) {
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
      } catch (err) {
        const msg = `Error fetching commits for ${touch.repo}: ${err}`;
        log('warn', msg);
        errors.push(msg);
      }
    }
  }

  log('info', 'Ingestion complete', { sessions: sessionCount, checkpoints: checkpointCount, links: linkCount });
  return { sessions: sessionCount, checkpoints: checkpointCount, links: linkCount, errors };
}
