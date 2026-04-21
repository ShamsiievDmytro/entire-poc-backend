import { describe, it, expect } from 'vitest';
import { computeLinks, computeTranscriptLinks } from '../src/domain/session-joiner.js';
import type { SessionRow, RepoCheckpointRow } from '../src/db/types.js';
import type { RepoCommit } from '../src/ingestion/github-client.js';

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    session_id: 'sess-1',
    workspace_checkpoint_id: null,
    started_at: '2026-04-21T10:00:00.000Z',
    ended_at: '2026-04-21T10:30:00.000Z',
    agent: 'claude-code',
    model: 'claude-sonnet-4-6',
    total_input_tokens: 1000,
    total_output_tokens: 500,
    total_cache_read_tokens: 0,
    friction_count: 0,
    open_items_count: 0,
    learnings_json: null,
    friction_json: null,
    open_items_json: null,
    raw_metadata_path: null,
    ...overrides,
  };
}

function makeCheckpoint(overrides: Partial<RepoCheckpointRow> = {}): RepoCheckpointRow {
  return {
    repo: 'entire-poc-backend',
    checkpoint_id: 'ckpt-1',
    commit_sha: 'abc123',
    committed_at: '2026-04-21T10:15:00.000Z',
    agent_percentage: 85,
    agent_lines: 42,
    human_added: 5,
    human_modified: 3,
    human_removed: 1,
    files_touched_json: JSON.stringify(['src/api/server.ts', 'src/index.ts']),
    session_id_in_metadata: null,
    ...overrides,
  };
}

function makeCommit(overrides: Partial<RepoCommit> = {}): RepoCommit {
  return {
    sha: 'abc123def',
    message: 'test commit',
    committedAt: '2026-04-21T10:15:00.000Z',
    files: ['src/api/server.ts'],
    ...overrides,
  };
}

describe('computeLinks (checkpoint-based)', () => {
  it('produces HIGH confidence on session ID match', () => {
    const session = makeSession();
    const ckpt = makeCheckpoint({ session_id_in_metadata: 'sess-1' });
    const links = computeLinks(session, new Set(), [ckpt]);

    expect(links).toHaveLength(1);
    expect(links[0].confidence).toBe('HIGH');
    expect(links[0].joinReason).toBe('session_id_match');
    expect(links[0].confidenceScore).toBe(1.0);
  });

  it('produces MEDIUM on ±5 min + file overlap', () => {
    const session = makeSession();
    const ckpt = makeCheckpoint({
      committed_at: '2026-04-21T10:12:00.000Z',
    });
    const filesTouched = new Set(['src/api/server.ts']);
    const links = computeLinks(session, filesTouched, [ckpt]);

    expect(links).toHaveLength(1);
    expect(links[0].confidence).toBe('MEDIUM');
    expect(links[0].joinReason).toBe('timestamp_files_overlap');
    expect(links[0].confidenceScore).toBe(0.7);
  });

  it('produces LOW on ±15 min only', () => {
    const session = makeSession();
    const ckpt = makeCheckpoint({
      committed_at: '2026-04-21T10:40:00.000Z',
      files_touched_json: JSON.stringify(['unrelated-file.ts']),
    });
    const links = computeLinks(session, new Set(['src/api/server.ts']), [ckpt]);

    expect(links).toHaveLength(1);
    expect(links[0].confidence).toBe('LOW');
    expect(links[0].joinReason).toBe('fallback');
    expect(links[0].confidenceScore).toBe(0.3);
  });

  it('produces no link if outside ±15 min window', () => {
    const session = makeSession();
    const ckpt = makeCheckpoint({
      committed_at: '2026-04-21T12:00:00.000Z',
    });
    const links = computeLinks(session, new Set(['src/api/server.ts']), [ckpt]);

    expect(links).toHaveLength(0);
  });

  it('prefers HIGH over MEDIUM when session ID matches', () => {
    const session = makeSession();
    const ckpt = makeCheckpoint({
      session_id_in_metadata: 'sess-1',
      committed_at: '2026-04-21T10:12:00.000Z',
    });
    const links = computeLinks(session, new Set(['src/api/server.ts']), [ckpt]);

    expect(links).toHaveLength(1);
    expect(links[0].confidence).toBe('HIGH');
  });

  it('handles multiple checkpoints', () => {
    const session = makeSession();
    const ckpt1 = makeCheckpoint({
      checkpoint_id: 'ckpt-1',
      session_id_in_metadata: 'sess-1',
    });
    const ckpt2 = makeCheckpoint({
      checkpoint_id: 'ckpt-2',
      repo: 'entire-poc-frontend',
      committed_at: '2026-04-21T10:20:00.000Z',
      files_touched_json: JSON.stringify(['src/App.tsx']),
    });
    const links = computeLinks(session, new Set(['src/App.tsx']), [ckpt1, ckpt2]);

    expect(links).toHaveLength(2);
    expect(links[0].confidence).toBe('HIGH');
    expect(links[1].confidence).toBe('MEDIUM');
  });
});

describe('computeTranscriptLinks (transcript-first)', () => {
  it('produces MEDIUM on ±5 min + file overlap', () => {
    const session = makeSession();
    const commit = makeCommit({
      committedAt: '2026-04-21T10:15:00.000Z',
      files: ['src/api/routes/status.ts'],
    });
    const sessionFiles = new Set(['src/api/routes/status.ts']);

    const links = computeTranscriptLinks(session, sessionFiles, 'entire-poc-backend', [commit]);

    expect(links).toHaveLength(1);
    expect(links[0].confidence).toBe('MEDIUM');
    expect(links[0].joinReason).toBe('timestamp_files_overlap');
    expect(links[0].confidenceScore).toBe(0.7);
    expect(links[0].repo).toBe('entire-poc-backend');
    expect(links[0].checkpointId).toBe(commit.sha);
  });

  it('produces LOW when within ±15 min but no file overlap', () => {
    const session = makeSession();
    const commit = makeCommit({
      committedAt: '2026-04-21T10:40:00.000Z',
      files: ['unrelated.ts'],
    });
    const sessionFiles = new Set(['src/api/routes/status.ts']);

    const links = computeTranscriptLinks(session, sessionFiles, 'entire-poc-backend', [commit]);

    expect(links).toHaveLength(1);
    expect(links[0].confidence).toBe('LOW');
    expect(links[0].joinReason).toBe('fallback');
    expect(links[0].confidenceScore).toBe(0.3);
  });

  it('produces no link outside ±15 min window', () => {
    const session = makeSession();
    const commit = makeCommit({
      committedAt: '2026-04-21T12:00:00.000Z',
      files: ['src/api/routes/status.ts'],
    });
    const sessionFiles = new Set(['src/api/routes/status.ts']);

    const links = computeTranscriptLinks(session, sessionFiles, 'entire-poc-backend', [commit]);

    expect(links).toHaveLength(0);
  });

  it('handles multiple commits with mixed confidence', () => {
    const session = makeSession();
    const commits = [
      makeCommit({
        sha: 'sha-1',
        committedAt: '2026-04-21T10:15:00.000Z',
        files: ['src/api/routes/status.ts'],
      }),
      makeCommit({
        sha: 'sha-2',
        committedAt: '2026-04-21T10:40:00.000Z',
        files: ['unrelated.ts'],
      }),
    ];
    const sessionFiles = new Set(['src/api/routes/status.ts']);

    const links = computeTranscriptLinks(session, sessionFiles, 'entire-poc-backend', commits);

    expect(links).toHaveLength(2);
    expect(links[0].confidence).toBe('MEDIUM');
    expect(links[0].checkpointId).toBe('sha-1');
    expect(links[1].confidence).toBe('LOW');
    expect(links[1].checkpointId).toBe('sha-2');
  });

  it('returns empty for session without started_at', () => {
    const session = makeSession({ started_at: '' });
    const commit = makeCommit();
    const links = computeTranscriptLinks(session, new Set(['src/api/server.ts']), 'repo', [commit]);

    expect(links).toHaveLength(0);
  });

  it('uses started_at as end when ended_at is null', () => {
    // Session with no end time — window is just the start point ±5min
    const session = makeSession({
      started_at: '2026-04-21T10:00:00.000Z',
      ended_at: null,
    });
    // Commit at +3 min, within ±5 min of the point session
    const commit = makeCommit({
      committedAt: '2026-04-21T10:03:00.000Z',
      files: ['src/api/routes/status.ts'],
    });

    const links = computeTranscriptLinks(
      session,
      new Set(['src/api/routes/status.ts']),
      'entire-poc-backend',
      [commit],
    );

    expect(links).toHaveLength(1);
    expect(links[0].confidence).toBe('MEDIUM');
  });
});
