import { log } from '../utils/logger.js';

/**
 * Parsed representation of a single prompt's attribution within a Git AI note.
 */
export interface GitAiPromptAttribution {
  promptId: string;
  agent: string;
  model: string | null;
  humanAuthor: string | null;
  totalAdditions: number;
  totalDeletions: number;
  acceptedLines: number;
  overriddenLines: number;
  messagesUrl: string | null;
}

/**
 * Parsed file-level attribution from the top section of a Git AI note.
 */
export interface GitAiFileAttribution {
  filePath: string;
  promptId: string;
  lineRanges: string;
}

/**
 * Full parsed Git AI note for a single commit.
 */
export interface ParsedGitAiNote {
  schemaVersion: string;
  gitAiVersion: string;
  baseCommitSha: string | null;
  files: GitAiFileAttribution[];
  prompts: GitAiPromptAttribution[];
  raw: string;
}

/**
 * Parse line ranges like "1-6" or "32" or "51-52,54,58-110" into a total line count.
 */
function countLinesFromRanges(rangeStr: string): number {
  let total = 0;
  for (const part of rangeStr.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const dash = trimmed.indexOf('-');
    if (dash === -1) {
      total += 1;
    } else {
      const start = parseInt(trimmed.slice(0, dash), 10);
      const end = parseInt(trimmed.slice(dash + 1), 10);
      if (!isNaN(start) && !isNaN(end)) {
        total += end - start + 1;
      }
    }
  }
  return total;
}

/**
 * Parse raw Git AI note content into structured data.
 *
 * Git AI note format (authorship/3.0.0):
 *
 *   <file_path>
 *     <prompt_id> <line_ranges>
 *   ---
 *   { JSON metadata }
 */
export function parseGitAiNote(raw: string): ParsedGitAiNote | null {
  if (!raw || !raw.trim()) return null;

  // Handle notes that start with --- (empty file map, e.g. human-only or deletion-only commits)
  let separatorIndex = raw.indexOf('\n---\n');
  if (separatorIndex === -1) {
    if (raw.startsWith('---\n')) {
      separatorIndex = 0;
    } else {
      log('warn', 'Git AI note missing --- separator', { preview: raw.slice(0, 100) });
      return null;
    }
  }

  const fileSection = separatorIndex === 0 ? '' : raw.slice(0, separatorIndex);
  const jsonSection = separatorIndex === 0 ? raw.slice(4) : raw.slice(separatorIndex + 5); // skip ---\n or \n---\n

  // Parse file attributions
  const files: GitAiFileAttribution[] = [];
  let currentFile: string | null = null;

  for (const line of fileSection.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      // File path line (not indented)
      currentFile = trimmed;
    } else if (currentFile) {
      // Indented: prompt_id + line ranges
      const parts = trimmed.trim().split(/\s+/);
      if (parts.length >= 2) {
        files.push({
          filePath: currentFile,
          promptId: parts[0],
          lineRanges: parts.slice(1).join(','),
        });
      }
    }
  }

  // Parse JSON metadata
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(jsonSection);
  } catch (err) {
    log('warn', 'Git AI note JSON parse failed', { error: String(err), preview: jsonSection.slice(0, 200) });
    return null;
  }

  const prompts: GitAiPromptAttribution[] = [];
  const promptsObj = (metadata.prompts ?? {}) as Record<string, Record<string, unknown>>;

  for (const [promptId, pData] of Object.entries(promptsObj)) {
    const agentId = pData.agent_id as Record<string, unknown> | undefined;
    prompts.push({
      promptId,
      agent: (agentId?.tool as string) ?? 'unknown',
      model: (agentId?.model as string) ?? null,
      humanAuthor: (pData.human_author as string) ?? null,
      totalAdditions: (pData.total_additions as number) ?? 0,
      totalDeletions: (pData.total_deletions as number) ?? 0,
      acceptedLines: (pData.accepted_lines as number) ?? 0,
      overriddenLines: (pData.overriden_lines as number) ?? 0,
      messagesUrl: (pData.messages_url as string) ?? null,
    });
  }

  return {
    schemaVersion: (metadata.schema_version as string) ?? 'unknown',
    gitAiVersion: (metadata.git_ai_version as string) ?? 'unknown',
    baseCommitSha: (metadata.base_commit_sha as string) ?? null,
    files,
    prompts,
    raw,
  };
}

/**
 * Compute agent and human line counts from parsed file attributions.
 * Uses the line ranges from the file section to count agent-attributed lines.
 * Uses the JSON prompt metadata for total additions to derive human lines.
 */
export function computeAttribution(parsed: ParsedGitAiNote): {
  agentLines: number;
  humanLines: number;
  agentPercentage: number;
  filesTouched: { file: string; promptId: string; lineRanges: string; lineCount: number }[];
} {
  let agentLines = 0;
  const filesTouched: { file: string; promptId: string; lineRanges: string; lineCount: number }[] = [];

  for (const f of parsed.files) {
    const count = countLinesFromRanges(f.lineRanges);
    agentLines += count;
    filesTouched.push({
      file: f.filePath,
      promptId: f.promptId,
      lineRanges: f.lineRanges,
      lineCount: count,
    });
  }

  // Total additions from all prompts gives us total lines changed
  const totalAdditions = parsed.prompts.reduce((sum, p) => sum + p.totalAdditions, 0);

  // Human lines = total additions minus agent-accepted lines
  // Use acceptedLines from prompts as ground truth if available
  const totalAccepted = parsed.prompts.reduce((sum, p) => sum + p.acceptedLines, 0);
  const humanLines = Math.max(0, totalAdditions - totalAccepted);

  const totalLines = agentLines + humanLines;
  const agentPercentage = totalLines > 0 ? Math.round((agentLines / totalLines) * 1000) / 10 : 0;

  return { agentLines, humanLines, agentPercentage, filesTouched };
}
