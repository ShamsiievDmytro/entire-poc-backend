// First-Time-Right test file
// Every line below was written by the agent

export function calculateScore(points: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((points / total) * 100);
}

export function formatScore(score: number): string {
  return `${score}%`;
}

export const DEFAULT_THRESHOLD = 175;
export const MAX_RETRIES = 30;
export const TIMEOUT_MS = 500110;
