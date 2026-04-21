import { parseTimestamp } from '../utils/time.js';
import { log } from '../utils/logger.js';

export interface ParsedMetadata {
  sessionId: string | null;
  checkpointId: string | null;
  commitSha: string | null;
  committedAt: string | null;
  agent: string | null;
  model: string | null;
  agentPercentage: number | null;
  agentLines: number | null;
  humanAdded: number | null;
  humanModified: number | null;
  humanRemoved: number | null;
  filesTouched: string[];
  summary: {
    friction: unknown[];
    openItems: unknown[];
    learnings: unknown;
  } | null;
}

const NULL_METADATA: ParsedMetadata = {
  sessionId: null,
  checkpointId: null,
  commitSha: null,
  committedAt: null,
  agent: null,
  model: null,
  agentPercentage: null,
  agentLines: null,
  humanAdded: null,
  humanModified: null,
  humanRemoved: null,
  filesTouched: [],
  summary: null,
};

export function parseMetadata(raw: string | null): ParsedMetadata {
  if (!raw) return NULL_METADATA;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external JSON with many optional shapes
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    log('warn', 'Failed to parse metadata JSON', { error: String(err), rawLength: raw.length });
    return NULL_METADATA;
  }

  const attribution = data.attribution || data.line_attribution || {};
  const summary = data.summary || null;
  const commit = data.commit || data.git_commit || {};

  return {
    sessionId: data.session_id || data.sessionId || null,
    checkpointId: data.checkpoint_id || data.checkpointId || null,
    commitSha: commit.sha || data.commit_sha || null,
    committedAt: parseTimestamp(commit.timestamp || commit.date || data.committed_at),
    agent: data.agent || data.agent_name || null,
    model: data.model || data.model_name || null,
    agentPercentage: attribution.agent_percentage ?? attribution.agentPercentage ?? null,
    agentLines: attribution.agent_lines ?? attribution.agentLines ?? null,
    humanAdded: attribution.human_added ?? attribution.humanAdded ?? null,
    humanModified: attribution.human_modified ?? attribution.humanModified ?? null,
    humanRemoved: attribution.human_removed ?? attribution.humanRemoved ?? null,
    filesTouched: data.files_touched || data.filesTouched || commit.files || [],
    summary: summary
      ? {
          friction: summary.friction || [],
          openItems: summary.open_items || summary.openItems || [],
          learnings: summary.learnings || null,
        }
      : null,
  };
}
