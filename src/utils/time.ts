/**
 * Time / date utility helpers.
 *
 * @module time
 */

/**
 * Parse an arbitrary timestamp value into an ISO-8601 string.
 *
 * Accepts anything that the `Date` constructor understands (Unix epoch in
 * milliseconds, ISO string, etc.).  Returns `null` for `null`/`undefined`
 * input or values that cannot be parsed into a valid date.
 *
 * @param value - Raw timestamp to parse.
 * @returns ISO-8601 string, or `null` if the value is absent/invalid.
 *
 * @example
 * parseTimestamp(1_700_000_000_000); // "2023-11-14T22:13:20.000Z"
 * parseTimestamp('not-a-date');       // null
 * parseTimestamp(null);               // null
 */
export function parseTimestamp(value: string | number | undefined | null): string | null {
  if (value == null) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Format a duration given in milliseconds into a compact human-readable string.
 *
 * - Durations of 60 seconds or more are returned as `"Xm Ys"` (e.g. `"2m 5s"`).
 * - Shorter durations are returned as `"Xs"` (e.g. `"42s"`).
 *
 * Fractional seconds are truncated (not rounded) so the display stays stable
 * during the last partial second.
 *
 * @param ms - Duration in milliseconds (non-negative).
 * @returns Human-readable duration string.
 *
 * @example
 * formatDuration(0);       // "0s"
 * formatDuration(5_000);   // "5s"
 * formatDuration(90_000);  // "1m 30s"
 * formatDuration(125_400); // "2m 5s"
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
