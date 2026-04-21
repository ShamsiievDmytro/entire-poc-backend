import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

export interface RawGitAiNote {
  commitSha: string;
  noteContent: string;
  committedAt: string | null;
  diffAdditions: number;
  diffDeletions: number;
}

function git(repoPath: string, args: string[]): string {
  return execFileSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf-8',
    timeout: 30_000,
  }).trim();
}

/**
 * Fetch all Git AI notes from a local repo using git CLI.
 * No GitHub API calls — reads directly from the local .git directory.
 */
export async function fetchGitAiNotes(
  _owner: string,
  repo: string,
): Promise<RawGitAiNote[]> {
  const repoPath = join(config.REPOS_BASE_PATH, repo);

  if (!existsSync(join(repoPath, '.git'))) {
    log('warn', `Repo not found locally: ${repoPath}`);
    return [];
  }

  const notes: RawGitAiNote[] = [];

  // Step 1: List all notes — each line is "<note_blob_sha> <commit_sha>"
  let noteList: string;
  try {
    noteList = git(repoPath, ['notes', '--ref=ai', 'list']);
  } catch {
    log('info', `No notes/ai ref in ${repo} — no Git AI data yet`);
    return [];
  }

  if (!noteList) return [];

  const lines = noteList.split('\n').filter(Boolean);

  // Step 2: For each noted commit, get the note content and commit metadata
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const commitSha = parts[1];

    try {
      // Get note content
      const noteContent = git(repoPath, ['notes', '--ref=ai', 'show', commitSha]);

      // Get commit date
      let committedAt: string | null = null;
      try {
        committedAt = git(repoPath, ['log', '-1', '--format=%aI', commitSha]);
      } catch {
        log('warn', `Could not get commit date for ${repo}@${commitSha}`);
      }

      // Get diff stats (additions/deletions) for accurate human line calculation
      let diffAdditions = 0;
      let diffDeletions = 0;
      try {
        const numstat = git(repoPath, ['diff', '--numstat', `${commitSha}^..${commitSha}`]);
        for (const statLine of numstat.split('\n').filter(Boolean)) {
          const [add, del] = statLine.split('\t');
          if (add !== '-') diffAdditions += parseInt(add, 10) || 0;
          if (del !== '-') diffDeletions += parseInt(del, 10) || 0;
        }
      } catch {
        // Root commit has no parent — diff against empty tree
        try {
          const emptyTree = '4b825dc642cb6eb9a060e54bf899d69f82cf2c0';
          const numstat = git(repoPath, ['diff', '--numstat', `${emptyTree}..${commitSha}`]);
          for (const statLine of numstat.split('\n').filter(Boolean)) {
            const [add, del] = statLine.split('\t');
            if (add !== '-') diffAdditions += parseInt(add, 10) || 0;
            if (del !== '-') diffDeletions += parseInt(del, 10) || 0;
          }
        } catch {
          // skip
        }
      }

      notes.push({ commitSha, noteContent, committedAt, diffAdditions, diffDeletions });
    } catch (err) {
      log('warn', `Failed to read note for ${repo}@${commitSha}`, { error: String(err) });
    }
  }

  log('info', `Fetched ${notes.length} Git AI notes from local ${repo}`);
  return notes;
}
