import 'dotenv/config';
import { z } from 'zod';

const Schema = z.object({
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN required'),
  GITHUB_OWNER: z.string().min(1),
  WORKSPACE_REPO: z.string().default('entire-poc-workspace'),
  SERVICE_REPOS: z.string().default('entire-poc-backend,entire-poc-frontend'),
  PORT: z.coerce.number().default(3001),
  DB_PATH: z.string().default('./data/poc.db'),
  INGESTION_INTERVAL_MS: z.coerce.number().default(5 * 60 * 1000),
});

const parsed = Schema.parse(process.env);

export const config = {
  ...parsed,
  serviceRepos: parsed.SERVICE_REPOS.split(',').map((s) => s.trim()),
  allRepos: [parsed.WORKSPACE_REPO, ...parsed.SERVICE_REPOS.split(',').map((s) => s.trim())],
};
