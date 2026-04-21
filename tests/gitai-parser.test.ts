import { describe, it, expect } from 'vitest';
import { parseGitAiNote, computeAttribution } from '../src/ingestion/gitai-parser.js';

const SAMPLE_NOTE = `src/utils/format.ts
  1612649c4bf0b88e 1-6
---
{
  "schema_version": "authorship/3.0.0",
  "git_ai_version": "1.3.2",
  "base_commit_sha": "4e027dc3ff77efe497fdb9f91ded8c1322e6800c",
  "prompts": {
    "1612649c4bf0b88e": {
      "agent_id": {
        "tool": "claude",
        "id": "9b4e6eb7-f49a-48c2-b519-1842319d6fe1",
        "model": "claude-opus-4-6"
      },
      "human_author": "Dmytro Shamsiiev",
      "messages": [],
      "total_additions": 6,
      "total_deletions": 0,
      "accepted_lines": 6,
      "overriden_lines": 0,
      "messages_url": "https://usegitai.com/cas/abc123"
    }
  }
}`;

const MULTI_FILE_NOTE = `src/api/routes/charts.ts
  6584ecc0b5c4444c 158-200
tests/session-duration.test.ts
  6584ecc0b5c4444c 1-62
---
{
  "schema_version": "authorship/3.0.0",
  "git_ai_version": "1.3.2",
  "base_commit_sha": "0871c3d921a23406d33cf13c3febf462587a6cfc",
  "prompts": {
    "6584ecc0b5c4444c": {
      "agent_id": {
        "tool": "claude",
        "id": "50fdee9d-f393-42f0-b68e-4b6d71bebb85",
        "model": "claude-opus-4-6"
      },
      "human_author": "Dmytro Shamsiiev",
      "messages": [],
      "total_additions": 105,
      "total_deletions": 0,
      "accepted_lines": 105,
      "overriden_lines": 0,
      "messages_url": "https://usegitai.com/cas/def456"
    }
  }
}`;

describe('parseGitAiNote', () => {
  it('parses a single-file note correctly', () => {
    const result = parseGitAiNote(SAMPLE_NOTE);
    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe('authorship/3.0.0');
    expect(result!.gitAiVersion).toBe('1.3.2');
    expect(result!.files).toHaveLength(1);
    expect(result!.files[0].filePath).toBe('src/utils/format.ts');
    expect(result!.files[0].promptId).toBe('1612649c4bf0b88e');
    expect(result!.files[0].lineRanges).toBe('1-6');
    expect(result!.prompts).toHaveLength(1);
    expect(result!.prompts[0].agent).toBe('claude');
    expect(result!.prompts[0].model).toBe('claude-opus-4-6');
    expect(result!.prompts[0].totalAdditions).toBe(6);
    expect(result!.prompts[0].acceptedLines).toBe(6);
  });

  it('parses a multi-file note correctly', () => {
    const result = parseGitAiNote(MULTI_FILE_NOTE);
    expect(result).not.toBeNull();
    expect(result!.files).toHaveLength(2);
    expect(result!.files[0].filePath).toBe('src/api/routes/charts.ts');
    expect(result!.files[0].lineRanges).toBe('158-200');
    expect(result!.files[1].filePath).toBe('tests/session-duration.test.ts');
    expect(result!.files[1].lineRanges).toBe('1-62');
  });

  it('returns null for empty input', () => {
    expect(parseGitAiNote('')).toBeNull();
    expect(parseGitAiNote('  ')).toBeNull();
  });

  it('returns null for note without separator', () => {
    expect(parseGitAiNote('just some text without separator')).toBeNull();
  });

  it('returns null for note with invalid JSON', () => {
    expect(parseGitAiNote('file.ts\n  abc 1-5\n---\n{invalid json')).toBeNull();
  });

  it('preserves raw note content', () => {
    const result = parseGitAiNote(SAMPLE_NOTE);
    expect(result!.raw).toBe(SAMPLE_NOTE);
  });
});

describe('computeAttribution', () => {
  it('computes correct attribution for a single-file 100% AI commit', () => {
    const parsed = parseGitAiNote(SAMPLE_NOTE)!;
    const attr = computeAttribution(parsed);
    expect(attr.agentLines).toBe(6);
    expect(attr.humanLines).toBe(0);
    expect(attr.agentPercentage).toBe(100);
    expect(attr.filesTouched).toHaveLength(1);
    expect(attr.filesTouched[0].lineCount).toBe(6);
  });

  it('computes correct attribution for multi-file commit', () => {
    const parsed = parseGitAiNote(MULTI_FILE_NOTE)!;
    const attr = computeAttribution(parsed);
    // lines 158-200 = 43 lines, lines 1-62 = 62 lines => 105 total
    expect(attr.agentLines).toBe(105);
    expect(attr.humanLines).toBe(0);
    expect(attr.agentPercentage).toBe(100);
    expect(attr.filesTouched).toHaveLength(2);
  });

  it('handles comma-separated line ranges', () => {
    const note = `src/file.ts
  abc123 1-5,10,20-25
---
{
  "schema_version": "authorship/3.0.0",
  "git_ai_version": "1.3.2",
  "prompts": {
    "abc123": {
      "agent_id": {"tool": "cursor", "model": "gpt-4"},
      "total_additions": 15,
      "accepted_lines": 12
    }
  }
}`;
    const parsed = parseGitAiNote(note)!;
    const attr = computeAttribution(parsed);
    // 1-5 = 5 lines, 10 = 1 line, 20-25 = 6 lines => 12 total
    expect(attr.agentLines).toBe(12);
    expect(attr.humanLines).toBe(3); // 15 total - 12 accepted
  });
});
