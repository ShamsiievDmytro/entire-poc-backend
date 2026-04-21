// Re-validated: Pattern A* (workspace-only) on 2026-04-21
// Validated: Pattern C cross-repo config
import 'dotenv/config';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const Schema = z.object({
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN required'),
  GITHUB_OWNER: z.string().min(1),
  WORKSPACE_REPO: z.string().default('entire-poc-workspace'),
  SERVICE_REPOS: z.string().default('entire-poc-backend,entire-poc-frontend'),
  PORT: z.coerce.number().default(3001),
  DB_PATH: z.string().default('./data/poc.db'),
  INGESTION_INTERVAL_MS: z.coerce.number().default(5 * 60 * 1000),
  GITAI_LOCAL_DB_PATH: z.string().default(join(homedir(), '.git-ai', 'internal', 'db')),
  REPOS_BASE_PATH: z.string().default(join(homedir(), 'Projects', 'metrics_2_0')),
});

const parsed = Schema.parse(process.env);

export const config = {
  ...parsed,
  serviceRepos: parsed.SERVICE_REPOS.split(',').map((s) => s.trim()),
  allRepos: [parsed.WORKSPACE_REPO, ...parsed.SERVICE_REPOS.split(',').map((s) => s.trim())],
};
