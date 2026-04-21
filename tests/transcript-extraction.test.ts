import { describe, it, expect } from 'vitest';
import { parseJsonl } from '../src/ingestion/jsonl-parser.js';

const KNOWN_REPOS = new Set([
  'entire-poc-workspace',
  'entire-poc-backend',
  'entire-poc-frontend',
]);

function makeLine(event: Record<string, unknown>): string {
  return JSON.stringify(event);
}

describe('transcript extraction → session_repo_touches', () => {
  it('extracts file touches per repo from filePath events', () => {
    const jsonl = [
      makeLine({
        timestamp: '2026-04-21T10:00:00Z',
        session_id: 'sess-abc',
        filePath: '/Users/dev/entire-poc-backend/src/api/routes/status.ts',
        tool: 'Edit',
      }),
      makeLine({
        timestamp: '2026-04-21T10:01:00Z',
        filePath: '/Users/dev/entire-poc-frontend/src/components/IngestionStatus.tsx',
        tool: 'Edit',
      }),
      makeLine({
        timestamp: '2026-04-21T10:02:00Z',
        filePath: '/Users/dev/entire-poc-workspace/skills/add-endpoint.md',
        tool: 'Read',
      }),
    ].join('\n');

    const parsed = parseJsonl(jsonl, { knownRepos: KNOWN_REPOS });

    // Should have 3 repos
    expect(parsed.filesTouchedByRepo.size).toBe(3);

    // Backend files
    const backendFiles = parsed.filesTouchedByRepo.get('entire-poc-backend');
    expect(backendFiles).toBeDefined();
    expect(backendFiles!.has('src/api/routes/status.ts')).toBe(true);

    // Frontend files
    const frontendFiles = parsed.filesTouchedByRepo.get('entire-poc-frontend');
    expect(frontendFiles).toBeDefined();
    expect(frontendFiles!.has('src/components/IngestionStatus.tsx')).toBe(true);

    // Workspace files
    const wsFiles = parsed.filesTouchedByRepo.get('entire-poc-workspace');
    expect(wsFiles).toBeDefined();
    expect(wsFiles!.has('skills/add-endpoint.md')).toBe(true);
  });

  it('accumulates tool calls per repo', () => {
    const jsonl = [
      makeLine({
        timestamp: '2026-04-21T10:00:00Z',
        filePath: '/Users/dev/entire-poc-backend/src/config.ts',
        tool: 'Edit',
      }),
      makeLine({
        timestamp: '2026-04-21T10:01:00Z',
        filePath: '/Users/dev/entire-poc-backend/src/server.ts',
        tool: 'Read',
      }),
      makeLine({
        timestamp: '2026-04-21T10:02:00Z',
        filePath: '/Users/dev/entire-poc-backend/src/config.ts',
        tool: 'Edit',
      }),
      makeLine({
        timestamp: '2026-04-21T10:03:00Z',
        filePath: '/Users/dev/entire-poc-frontend/src/App.tsx',
        tool: 'Edit',
      }),
    ].join('\n');

    const parsed = parseJsonl(jsonl, { knownRepos: KNOWN_REPOS });

    const backendTools = parsed.toolCallsByRepo.get('entire-poc-backend');
    expect(backendTools).toBeDefined();
    expect(backendTools!.get('Edit')).toBe(2);
    expect(backendTools!.get('Read')).toBe(1);

    const frontendTools = parsed.toolCallsByRepo.get('entire-poc-frontend');
    expect(frontendTools).toBeDefined();
    expect(frontendTools!.get('Edit')).toBe(1);
  });

  it('extracts session timing from timestamps', () => {
    const jsonl = [
      makeLine({
        timestamp: '2026-04-21T10:05:00Z',
        filePath: '/Users/dev/entire-poc-backend/src/x.ts',
      }),
      makeLine({
        timestamp: '2026-04-21T10:00:00Z',
        filePath: '/Users/dev/entire-poc-backend/src/y.ts',
      }),
      makeLine({
        timestamp: '2026-04-21T10:30:00Z',
        filePath: '/Users/dev/entire-poc-backend/src/z.ts',
      }),
    ].join('\n');

    const parsed = parseJsonl(jsonl, { knownRepos: KNOWN_REPOS });

    expect(parsed.startedAt).toBe('2026-04-21T10:00:00.000Z');
    expect(parsed.endedAt).toBe('2026-04-21T10:30:00.000Z');
  });

  it('ignores unknown repo paths', () => {
    const jsonl = [
      makeLine({
        timestamp: '2026-04-21T10:00:00Z',
        filePath: '/Users/dev/some-other-repo/src/x.ts',
      }),
      makeLine({
        timestamp: '2026-04-21T10:01:00Z',
        filePath: '/Users/dev/entire-poc-backend/src/y.ts',
      }),
    ].join('\n');

    const parsed = parseJsonl(jsonl, { knownRepos: KNOWN_REPOS });

    // Only backend should be present
    expect(parsed.filesTouchedByRepo.size).toBe(1);
    expect(parsed.filesTouchedByRepo.has('entire-poc-backend')).toBe(true);
  });

  it('handles empty jsonl gracefully', () => {
    const parsed = parseJsonl('', { knownRepos: KNOWN_REPOS });

    expect(parsed.filesTouchedByRepo.size).toBe(0);
    expect(parsed.startedAt).toBeNull();
    expect(parsed.endedAt).toBeNull();
  });

  it('deduplicates files within a repo', () => {
    const jsonl = [
      makeLine({
        timestamp: '2026-04-21T10:00:00Z',
        filePath: '/Users/dev/entire-poc-backend/src/config.ts',
        tool: 'Read',
      }),
      makeLine({
        timestamp: '2026-04-21T10:01:00Z',
        filePath: '/Users/dev/entire-poc-backend/src/config.ts',
        tool: 'Edit',
      }),
    ].join('\n');

    const parsed = parseJsonl(jsonl, { knownRepos: KNOWN_REPOS });

    const files = parsed.filesTouchedByRepo.get('entire-poc-backend');
    expect(files!.size).toBe(1);
    expect(files!.has('src/config.ts')).toBe(true);
  });
});
