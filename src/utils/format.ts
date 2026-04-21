/**
 * Format a number as a percentage string, rounded to 1 decimal place.
 */
export function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}
