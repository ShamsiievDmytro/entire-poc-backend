import type { SessionRow, RepoCheckpointRow } from '../db/types.js';
import type { RepoCommit } from '../ingestion/github-client.js';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type JoinReason =
  | 'session_id_match'
  | 'timestamp_files_overlap'
  | 'fallback';

export interface SessionLink {
  sessionId: string;
  repo: string;
  checkpointId: string;
  confidence: Confidence;
  joinReason: JoinReason;
  confidenceScore: number;
}

const FIVE_MIN_MS = 5 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/**
 * Original checkpoint-based linking (still used for workspace repo self-links).
 */
export function computeLinks(
  session: SessionRow,
  filesTouchedBySession: ReadonlySet<string>,
  candidateCheckpoints: readonly RepoCheckpointRow[],
): SessionLink[] {
  const links: SessionLink[] = [];

  for (const ckpt of candidateCheckpoints) {
    // 1. HIGH: exact session ID match in checkpoint metadata
    if (ckpt.session_id_in_metadata === session.session_id) {
      links.push({
        sessionId: session.session_id,
        repo: ckpt.repo,
        checkpointId: ckpt.checkpoint_id,
        confidence: 'HIGH',
        joinReason: 'session_id_match',
        confidenceScore: 1.0,
      });
      continue;
    }

    if (!session.ended_at || !ckpt.committed_at) continue;

    const sessionWindowStart = new Date(session.started_at).getTime();
    const sessionWindowEnd = new Date(session.ended_at).getTime();
    const commitTime = new Date(ckpt.committed_at).getTime();

    // 2. MEDIUM: +/-5 min overlap AND file overlap
    const within5 =
      commitTime >= sessionWindowStart - FIVE_MIN_MS &&
      commitTime <= sessionWindowEnd + FIVE_MIN_MS;

    if (within5) {
      const ckptFiles: string[] = JSON.parse(ckpt.files_touched_json || '[]');
      const overlap = ckptFiles.some((f) => filesTouchedBySession.has(f));
      if (overlap) {
        links.push({
          sessionId: session.session_id,
          repo: ckpt.repo,
          checkpointId: ckpt.checkpoint_id,
          confidence: 'MEDIUM',
          joinReason: 'timestamp_files_overlap',
          confidenceScore: 0.7,
        });
        continue;
      }
    }

    // 3. LOW: +/-15 min overlap, no file overlap
    const within15 =
      commitTime >= sessionWindowStart - FIFTEEN_MIN_MS &&
      commitTime <= sessionWindowEnd + FIFTEEN_MIN_MS;

    if (within15) {
      links.push({
        sessionId: session.session_id,
        repo: ckpt.repo,
        checkpointId: ckpt.checkpoint_id,
        confidence: 'LOW',
        joinReason: 'fallback',
        confidenceScore: 0.3,
      });
    }
  }

  return links;
}

/**
 * Transcript-first linking: match workspace sessions to service repo commits
 * fetched from the GitHub API. Used when service repos don't have Entire checkpoints.
 *
 * For each commit in the repo:
 *   - MEDIUM: commit within ±5 min of session window AND file overlap
 *   - LOW: commit within ±15 min of session window, no file overlap required
 */
export function computeTranscriptLinks(
  session: SessionRow,
  sessionFilesForRepo: ReadonlySet<string>,
  repo: string,
  commits: readonly RepoCommit[],
): SessionLink[] {
  if (!session.started_at) return [];

  const links: SessionLink[] = [];
  const sessionStart = new Date(session.started_at).getTime();
  const sessionEnd = session.ended_at
    ? new Date(session.ended_at).getTime()
    : sessionStart;

  for (const commit of commits) {
    if (!commit.committedAt) continue;

    const commitTime = new Date(commit.committedAt).getTime();

    // Check ±5 min window + file overlap → MEDIUM
    const within5 =
      commitTime >= sessionStart - FIVE_MIN_MS &&
      commitTime <= sessionEnd + FIVE_MIN_MS;

    if (within5) {
      const overlap = commit.files.some((f) => sessionFilesForRepo.has(f));
      if (overlap) {
        links.push({
          sessionId: session.session_id,
          repo,
          checkpointId: commit.sha,
          confidence: 'MEDIUM',
          joinReason: 'timestamp_files_overlap',
          confidenceScore: 0.7,
        });
        continue;
      }
    }

    // Check ±15 min window → LOW
    const within15 =
      commitTime >= sessionStart - FIFTEEN_MIN_MS &&
      commitTime <= sessionEnd + FIFTEEN_MIN_MS;

    if (within15) {
      links.push({
        sessionId: session.session_id,
        repo,
        checkpointId: commit.sha,
        confidence: 'LOW',
        joinReason: 'fallback',
        confidenceScore: 0.3,
      });
    }
  }

  return links;
}
