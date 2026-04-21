import { Octokit } from '@octokit/rest';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

let instance: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!instance) {
    log('info', 'Creating Octokit instance', { tokenPrefix: config.GITHUB_TOKEN.slice(0, 15) });
    instance = new Octokit({ auth: config.GITHUB_TOKEN });
  }
  return instance;
}

export interface RepoCommit {
  sha: string;
  message: string;
  committedAt: string;
  files: string[];
}

/**
 * Fetch commits from a repo within a time window, including their changed files.
 * Used by the transcript-first joiner to match workspace sessions to service repo commits.
 */
export async function fetchRepoCommitsInWindow(
  owner: string,
  repo: string,
  since: string,
  until: string,
): Promise<RepoCommit[]> {
  const octokit = getOctokit();
  const commits: RepoCommit[] = [];

  try {
    const listRes = await octokit.rest.repos.listCommits({
      owner,
      repo,
      since,
      until,
      per_page: 100,
    });

    for (const c of listRes.data) {
      let files: string[] = [];
      try {
        const detail = await octokit.rest.repos.getCommit({
          owner,
          repo,
          ref: c.sha,
        });
        files = (detail.data.files || []).map((f) => f.filename);
      } catch (err) {
        log('warn', `Failed to fetch files for ${repo}@${c.sha}`, { error: String(err) });
      }

      commits.push({
        sha: c.sha,
        message: c.commit.message,
        committedAt: c.commit.committer?.date || c.commit.author?.date || '',
        files,
      });
    }
  } catch (err) {
    log('warn', `Failed to list commits for ${owner}/${repo}`, { error: String(err) });
  }

  return commits;
}
