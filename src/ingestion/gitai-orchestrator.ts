import { config } from '../config.js';
import { fetchGitAiNotes } from './gitai-fetcher.js';
import { parseGitAiNote, computeAttribution } from './gitai-parser.js';
import { createGitAiRepo } from '../db/gitai-repo.js';
import { log } from '../utils/logger.js';
import type Database from 'better-sqlite3';

export interface GitAiIngestionReport {
  commits: number;
  repos: number;
  errors: string[];
}

export async function runGitAiIngestion(db: Database.Database): Promise<GitAiIngestionReport> {
  const gitaiRepo = createGitAiRepo(db);
  const errors: string[] = [];
  let totalCommits = 0;
  const reposWithData = new Set<string>();

  for (const repo of config.allRepos) {
    try {
      const rawNotes = await fetchGitAiNotes(config.GITHUB_OWNER, repo);

      // Incremental: skip commits already in the database
      // First pass: filter by watermark (uses indexed captured_at column)
      const latestDate = gitaiRepo.latestCapturedAt(repo);
      let candidates = rawNotes;
      if (latestDate) {
        candidates = rawNotes.filter(n => !n.committedAt || n.committedAt > latestDate);
      }
      // Second pass: check remaining by SHA (catches edge cases like same-second commits)
      const newNotes = candidates.filter(n => !gitaiRepo.existsBySha(n.commitSha));

      if (newNotes.length < rawNotes.length) {
        log('info', `${repo}: ${rawNotes.length} notes total, ${newNotes.length} new, ${rawNotes.length - newNotes.length} skipped (already ingested)`);
      }

      for (const note of newNotes) {
        const parsed = parseGitAiNote(note.noteContent);
        if (!parsed) {
          log('warn', `Unparseable Git AI note for ${repo}@${note.commitSha}`);
          continue;
        }

        const attribution = computeAttribution(parsed);

        // One row per prompt (agent) in the note
        // Use git diff additions as ground truth for total lines added
        const diffAdded = note.diffAdditions;

        for (const prompt of parsed.prompts) {
          const promptFiles = attribution.filesTouched.filter(
            (f) => f.promptId === prompt.promptId,
          );
          const promptAgentLines = promptFiles.reduce((sum, f) => sum + f.lineCount, 0);
          const overriddenLines = prompt.overriddenLines;
          // Human lines = diff additions minus agent lines minus overridden lines
          const promptHumanLines = Math.max(0, diffAdded - promptAgentLines - overriddenLines);
          const pctTotal = promptAgentLines + promptHumanLines + overriddenLines;
          const pct = pctTotal > 0 ? Math.round((promptAgentLines / pctTotal) * 1000) / 10 : 0;

          gitaiRepo.upsert({
            repo,
            commit_sha: note.commitSha,
            agent: prompt.agent,
            model: prompt.model,
            agent_lines: promptAgentLines,
            human_lines: promptHumanLines,
            overridden_lines: overriddenLines,
            agent_percentage: pct,
            prompt_id: prompt.promptId,
            commit_author: note.commitAuthor,
            commit_message: note.commitMessage,
            diff_additions: note.diffAdditions,
            diff_deletions: note.diffDeletions,
            files_touched_json: JSON.stringify(promptFiles),
            raw_note_json: note.noteContent,
            captured_at: note.committedAt,
          });

          totalCommits++;
          reposWithData.add(repo);
        }
      }
    } catch (err) {
      const msg = `Error ingesting Git AI notes from ${repo}: ${err}`;
      log('error', msg);
      errors.push(msg);
    }
  }

  log('info', 'Git AI ingestion complete', {
    commits: totalCommits,
    repos: reposWithData.size,
  });

  return { commits: totalCommits, repos: reposWithData.size, errors };
}
