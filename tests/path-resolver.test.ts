import { describe, it, expect } from 'vitest';
import { resolveRepoFromAbsolutePath, relativePathFromRepo } from '../src/domain/path-resolver.js';

const known = new Set(['entire-poc-workspace', 'entire-poc-backend', 'entire-poc-frontend']);

describe('resolveRepoFromAbsolutePath', () => {
  it('resolves a backend file', () => {
    expect(
      resolveRepoFromAbsolutePath('/Users/dev/entire-poc/entire-poc-backend/src/api/server.ts', known),
    ).toBe('entire-poc-backend');
  });

  it('resolves a frontend file', () => {
    expect(
      resolveRepoFromAbsolutePath('/Users/dev/entire-poc/entire-poc-frontend/src/App.tsx', known),
    ).toBe('entire-poc-frontend');
  });

  it('resolves a workspace file', () => {
    expect(
      resolveRepoFromAbsolutePath('/Users/dev/entire-poc/entire-poc-workspace/scripts/lib/repos.sh', known),
    ).toBe('entire-poc-workspace');
  });

  it('resolves a Windows-style path', () => {
    expect(
      resolveRepoFromAbsolutePath('C:\\dev\\entire-poc\\entire-poc-frontend\\src\\App.tsx', known),
    ).toBe('entire-poc-frontend');
  });

  it('returns null for unknown paths', () => {
    expect(
      resolveRepoFromAbsolutePath('/Users/dev/some-other-project/file.ts', known),
    ).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveRepoFromAbsolutePath('', known)).toBeNull();
  });

  it('handles deeply nested paths', () => {
    expect(
      resolveRepoFromAbsolutePath('/a/b/c/d/entire-poc-backend/src/db/schema.sql', known),
    ).toBe('entire-poc-backend');
  });
});

describe('relativePathFromRepo', () => {
  it('returns relative path after repo segment', () => {
    expect(
      relativePathFromRepo('/Users/dev/entire-poc/entire-poc-backend/src/api/server.ts', 'entire-poc-backend'),
    ).toBe('src/api/server.ts');
  });

  it('handles Windows paths', () => {
    expect(
      relativePathFromRepo('C:\\dev\\entire-poc\\entire-poc-frontend\\src\\App.tsx', 'entire-poc-frontend'),
    ).toBe('src/App.tsx');
  });

  it('returns null when repo not in path', () => {
    expect(
      relativePathFromRepo('/Users/dev/other-repo/file.ts', 'entire-poc-backend'),
    ).toBeNull();
  });
});
