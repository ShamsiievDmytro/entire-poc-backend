import { resolveRepoFromAbsolutePath, relativePathFromRepo } from '../domain/path-resolver.js';
import { parseTimestamp } from '../utils/time.js';
import { log } from '../utils/logger.js';

export interface ParsedSession {
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  agent: string | null;
  model: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  filesTouchedByRepo: Map<string, Set<string>>;
  toolCallsByRepo: Map<string, Map<string, number>>;
  slashCommandsByRepo: Map<string, Set<string>>;
  subagentCountByRepo: Map<string, number>;
}

interface JsonlParseOptions {
  knownRepos: ReadonlySet<string>;
  sessionIdOverride?: string;
}

export function parseJsonl(jsonlText: string, opts: JsonlParseOptions): ParsedSession {
  const lines = jsonlText.split('\n').filter((l) => l.trim());
  const events: Record<string, unknown>[] = [];
  let malformedCount = 0;

  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      malformedCount++;
    }
  }

  if (malformedCount > 0) {
    log('warn', `Skipped ${malformedCount} malformed JSONL lines`, {
      sessionIdOverride: opts.sessionIdOverride,
      totalLines: lines.length,
    });
  }

  let sessionId = opts.sessionIdOverride || '';
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let agent: string | null = null;
  let model: string | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;

  const filesTouchedByRepo = new Map<string, Set<string>>();
  const toolCallsByRepo = new Map<string, Map<string, number>>();
  const slashCommandsByRepo = new Map<string, Set<string>>();
  const subagentCountByRepo = new Map<string, number>();

  // Helper: record a file touch
  function recordFileTouch(absPath: string) {
    const repo = resolveRepoFromAbsolutePath(absPath, opts.knownRepos);
    if (repo) {
      if (!filesTouchedByRepo.has(repo)) filesTouchedByRepo.set(repo, new Set());
      const relPath = relativePathFromRepo(absPath, repo);
      if (relPath) filesTouchedByRepo.get(repo)!.add(relPath);
    }
  }

  // Helper: record a tool call
  function recordToolCall(toolName: string, absPath: string | null) {
    const repo = absPath ? resolveRepoFromAbsolutePath(absPath, opts.knownRepos) : null;
    const targetRepo = repo || '_workspace';
    if (!toolCallsByRepo.has(targetRepo)) toolCallsByRepo.set(targetRepo, new Map());
    const m = toolCallsByRepo.get(targetRepo)!;
    m.set(toolName, (m.get(toolName) || 0) + 1);
  }

  for (const event of events) {
    const ts = parseTimestamp(event.timestamp as string | number);
    if (ts) {
      if (!startedAt || ts < startedAt) startedAt = ts;
      if (!endedAt || ts > endedAt) endedAt = ts;
    }

    // Extract session ID
    if (event.session_id || event.sessionId) {
      sessionId = (event.session_id || event.sessionId) as string;
    }

    // Extract agent info
    if (event.agent) agent = event.agent as string;
    if (event.model) model = event.model as string;

    // Token usage
    const usage = event.usage as Record<string, number> | undefined;
    if (usage) {
      totalInputTokens += usage.input_tokens || usage.inputTokens || 0;
      totalOutputTokens += usage.output_tokens || usage.outputTokens || 0;
      totalCacheReadTokens += usage.cache_read_tokens || usage.cacheReadTokens || 0;
    }

    // --- Extract file paths and tool names from all known locations ---

    // 1. Top-level filePath (simple event format)
    const topFilePath = (event.filePath || event.file_path || event.path) as string | undefined;
    if (topFilePath) recordFileTouch(topFilePath);

    // 2. toolUseResult (user-type events with tool results)
    const toolResult = event.toolUseResult as Record<string, unknown> | undefined;
    if (toolResult) {
      const trFile = toolResult.file as Record<string, unknown> | undefined;
      const trPath = (
        toolResult.filePath || toolResult.file_path ||
        trFile?.filePath || trFile?.file_path
      ) as string | undefined;
      if (trPath) recordFileTouch(trPath);
    }

    // 3. Assistant tool_use events: message.content[].type=tool_use
    //    These contain tool name + input.file_path
    const message = event.message as { content?: unknown[] } | undefined;
    if (Array.isArray(message?.content)) {
      for (const block of message!.content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use' && b.name) {
          const input = b.input as Record<string, unknown> | undefined;
          const inputPath = (input?.file_path || input?.filePath) as string | undefined;
          if (inputPath) recordFileTouch(inputPath);
          recordToolCall(b.name as string, inputPath || null);
        }
      }
    }

    // 4. Top-level tool name (simple event format)
    const topToolName = (event.tool || event.tool_name || event.toolName) as string | undefined;
    if (topToolName) {
      const anyPath = topFilePath ||
        (toolResult?.filePath || toolResult?.file_path ||
         (toolResult?.file as Record<string, unknown> | undefined)?.filePath);
      recordToolCall(topToolName, typeof anyPath === 'string' ? anyPath : null);
    }

    // Slash commands
    const slashCmd = (event.slash_command || event.slashCommand) as string | undefined;
    if (slashCmd) {
      const anyPath = topFilePath;
      const repo = anyPath ? resolveRepoFromAbsolutePath(anyPath, opts.knownRepos) : null;
      const targetRepo = repo || '_workspace';
      if (!slashCommandsByRepo.has(targetRepo)) slashCommandsByRepo.set(targetRepo, new Set());
      slashCommandsByRepo.get(targetRepo)!.add(slashCmd);
    }

    // Subagent spawns
    const eventType = (event.type || event.event_type) as string | undefined;
    if (eventType === 'task_spawn' || eventType === 'subagent') {
      const anyPath = topFilePath;
      const repo = anyPath ? resolveRepoFromAbsolutePath(anyPath, opts.knownRepos) : null;
      const targetRepo = repo || '_workspace';
      subagentCountByRepo.set(targetRepo, (subagentCountByRepo.get(targetRepo) || 0) + 1);
    }
  }

  return {
    sessionId,
    startedAt,
    endedAt,
    agent,
    model,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    filesTouchedByRepo,
    toolCallsByRepo,
    slashCommandsByRepo,
    subagentCountByRepo,
  };
}
