import { resolveRepoFromAbsolutePath, relativePathFromRepo } from '../domain/path-resolver.js';
import { parseTimestamp } from '../utils/time.js';

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

  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
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

    // File path events
    const filePath = (event.filePath || event.file_path || event.path) as string | undefined;
    if (filePath) {
      const repo = resolveRepoFromAbsolutePath(filePath, opts.knownRepos);
      if (repo) {
        if (!filesTouchedByRepo.has(repo)) filesTouchedByRepo.set(repo, new Set());
        const relPath = relativePathFromRepo(filePath, repo);
        if (relPath) filesTouchedByRepo.get(repo)!.add(relPath);
      }
    }

    // Tool calls
    const toolName = (event.tool || event.tool_name || event.toolName) as string | undefined;
    if (toolName && filePath) {
      const repo = resolveRepoFromAbsolutePath(filePath, opts.knownRepos);
      const targetRepo = repo || '_workspace';
      if (!toolCallsByRepo.has(targetRepo)) toolCallsByRepo.set(targetRepo, new Map());
      const m = toolCallsByRepo.get(targetRepo)!;
      m.set(toolName, (m.get(toolName) || 0) + 1);
    } else if (toolName) {
      if (!toolCallsByRepo.has('_workspace')) toolCallsByRepo.set('_workspace', new Map());
      const m = toolCallsByRepo.get('_workspace')!;
      m.set(toolName, (m.get(toolName) || 0) + 1);
    }

    // Slash commands
    const slashCmd = (event.slash_command || event.slashCommand) as string | undefined;
    if (slashCmd) {
      const repo = filePath ? resolveRepoFromAbsolutePath(filePath, opts.knownRepos) : null;
      const targetRepo = repo || '_workspace';
      if (!slashCommandsByRepo.has(targetRepo)) slashCommandsByRepo.set(targetRepo, new Set());
      slashCommandsByRepo.get(targetRepo)!.add(slashCmd);
    }

    // Subagent spawns
    const eventType = (event.type || event.event_type) as string | undefined;
    if (eventType === 'task_spawn' || eventType === 'subagent') {
      const repo = filePath ? resolveRepoFromAbsolutePath(filePath, opts.knownRepos) : null;
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
