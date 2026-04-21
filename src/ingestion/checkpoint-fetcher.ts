import { log } from '../utils/logger.js';
import { getOctokit } from './github-client.js';

export interface RawCheckpoint {
  checkpointId: string;
  metadataJson: string | null;
  sessionFiles: { sessionId: string; jsonlText: string }[];
}

export async function fetchCheckpointBranch(
  owner: string,
  repo: string,
): Promise<RawCheckpoint[]> {
  const octokit = getOctokit();
  const branch = 'entire/checkpoints/v1';

  let tree: { path?: string; sha?: string; type?: string }[];
  try {
    log('info', `Fetching tree for ${owner}/${repo}@${branch}`);
    const res = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: 'true',
    });
    tree = res.data.tree;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      log('info', `No checkpoint branch found for ${repo}`, { branch });
      return [];
    }
    throw err;
  }

  // Group files by checkpoint folder
  // Structure: <2-char-prefix>/<checkpoint-id>/metadata.json
  //            <2-char-prefix>/<checkpoint-id>/sessions/<session-id>/full.jsonl
  const checkpointMap = new Map<string, { files: Map<string, string> }>();

  const blobEntries = tree.filter(
    (e) => e.type === 'blob' && e.path && e.sha,
  );

  for (const entry of blobEntries) {
    const parts = entry.path!.split('/');
    if (parts.length < 3) continue;

    // parts[0] = 2-char prefix, parts[1] = checkpoint ID
    const checkpointId = parts[1];
    if (!checkpointMap.has(checkpointId)) {
      checkpointMap.set(checkpointId, { files: new Map() });
    }

    // Fetch blob content
    try {
      const blob = await octokit.rest.git.getBlob({
        owner,
        repo,
        file_sha: entry.sha!,
      });
      const content = Buffer.from(blob.data.content, 'base64').toString('utf-8');
      checkpointMap.get(checkpointId)!.files.set(entry.path!, content);
    } catch (err) {
      log('warn', `Failed to fetch blob ${entry.path} in ${repo}`, {
        error: String(err),
      });
    }
  }

  const checkpoints: RawCheckpoint[] = [];
  for (const [checkpointId, data] of checkpointMap) {
    let metadataJson: string | null = null;
    const sessionFiles: { sessionId: string; jsonlText: string }[] = [];

    for (const [path, content] of data.files) {
      if (path.endsWith('metadata.json')) {
        metadataJson = content;
      } else if (path.endsWith('full.jsonl')) {
        // Extract session ID from path: .../sessions/<sessionId>/full.jsonl
        const segs = path.split('/');
        const sessIdx = segs.indexOf('sessions');
        const sessionId = sessIdx >= 0 && sessIdx + 1 < segs.length
          ? segs[sessIdx + 1]
          : checkpointId;
        sessionFiles.push({ sessionId, jsonlText: content });
      }
    }

    checkpoints.push({ checkpointId, metadataJson, sessionFiles });
  }

  log('info', `Fetched ${checkpoints.length} checkpoints from ${repo}`);
  return checkpoints;
}
