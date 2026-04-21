import { getOctokit } from './github-client.js';
import { log } from '../utils/logger.js';

export interface RawGitAiNote {
  commitSha: string;
  noteContent: string;
  committedAt: string | null;
}

/**
 * Fetch all Git AI notes (refs/notes/ai) from a GitHub repo.
 *
 * Strategy: use the Git database API to walk the notes tree.
 * Each entry in the notes tree is named after the commit SHA it annotates,
 * and the blob content is the note itself.
 */
export async function fetchGitAiNotes(
  owner: string,
  repo: string,
): Promise<RawGitAiNote[]> {
  const octokit = getOctokit();
  const notes: RawGitAiNote[] = [];

  // Step 1: Get the notes/ai ref
  let noteRefSha: string;
  try {
    const ref = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: 'notes/ai',
    });
    noteRefSha = ref.data.object.sha;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      log('info', `No notes/ai ref in ${owner}/${repo} — no Git AI data yet`);
      return [];
    }
    throw err;
  }

  // Step 2: Get the commit that the ref points to, then the tree
  let treeSha: string;
  try {
    const commit = await octokit.rest.git.getCommit({ owner, repo, commit_sha: noteRefSha });
    treeSha = commit.data.tree.sha;
  } catch {
    // The ref might point directly to a tree (not a commit)
    treeSha = noteRefSha;
  }

  // Step 3: Walk the tree. Git notes uses a fan-out structure:
  // Either flat (full SHA as filename) or 2-char prefix dirs.
  let tree: { path?: string; sha?: string; type?: string }[];
  try {
    const treeRes = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: 'true',
    });
    tree = treeRes.data.tree;
  } catch (err) {
    log('error', `Failed to get notes tree for ${owner}/${repo}`, { error: String(err) });
    return [];
  }

  // Step 4: Each blob is a note. The path reconstructs the commit SHA.
  // Fan-out format: "ab/cdef1234..." → commit SHA "abcdef1234..."
  const blobEntries = tree.filter((e) => e.type === 'blob' && e.path && e.sha);

  for (const entry of blobEntries) {
    const commitSha = entry.path!.replace(/\//g, '');
    if (commitSha.length < 7) continue; // skip non-SHA entries

    try {
      const blob = await octokit.rest.git.getBlob({
        owner,
        repo,
        file_sha: entry.sha!,
      });
      const noteContent = Buffer.from(blob.data.content, 'base64').toString('utf-8');

      // Fetch commit date
      let committedAt: string | null = null;
      try {
        const commitRes = await octokit.rest.repos.getCommit({ owner, repo, ref: commitSha });
        committedAt = commitRes.data.commit.committer?.date ?? commitRes.data.commit.author?.date ?? null;
      } catch {
        log('warn', `Could not fetch commit date for ${repo}@${commitSha}`);
      }

      notes.push({ commitSha, noteContent, committedAt });
    } catch (err) {
      log('warn', `Failed to fetch note blob for ${repo}@${commitSha}`, { error: String(err) });
    }
  }

  log('info', `Fetched ${notes.length} Git AI notes from ${owner}/${repo}`);
  return notes;
}
