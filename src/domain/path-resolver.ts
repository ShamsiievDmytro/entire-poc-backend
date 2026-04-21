/**
 * Maps an absolute file path captured in an Entire transcript back to one
 * of the known PoC repos.
 *
 * Strategy: walk the path segments and return the first one that matches
 * a known repo name. This works regardless of where the developer cloned
 * the repos on their machine.
 */
export function resolveRepoFromAbsolutePath(
  absPath: string,
  knownRepos: ReadonlySet<string>,
): string | null {
  const normalized = absPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  for (const seg of segments) {
    if (knownRepos.has(seg)) return seg;
  }
  return null;
}

/**
 * Returns the repo-relative path (the portion AFTER the matched repo segment).
 * Used for tagging files_touched lists with relative paths only.
 */
export function relativePathFromRepo(
  absPath: string,
  repo: string,
): string | null {
  const normalized = absPath.replace(/\\/g, '/');
  const idx = normalized.indexOf(`/${repo}/`);
  if (idx < 0) return null;
  return normalized.slice(idx + repo.length + 2);
}
