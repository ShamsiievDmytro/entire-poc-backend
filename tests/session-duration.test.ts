import { describe, it, expect } from 'vitest';

/**
 * Pure duration calculation extracted from the charts route logic.
 * (end - start) in minutes, rounded to 1 decimal.
 */
function computeDurationMinutes(startedAt: string, endedAt: string): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return Math.round(((end - start) / 60_000) * 10) / 10;
}

describe('session duration calculation', () => {
  it('computes a normal 30-minute session', () => {
    const result = computeDurationMinutes(
      '2026-04-21T10:00:00.000Z',
      '2026-04-21T10:30:00.000Z',
    );
    expect(result).toBe(30);
  });

  it('computes a very short session (under 1 minute)', () => {
    const result = computeDurationMinutes(
      '2026-04-21T10:00:00.000Z',
      '2026-04-21T10:00:15.000Z',
    );
    expect(result).toBe(0.3); // 15 seconds = 0.25 min → rounds to 0.3
  });

  it('handles a session spanning an hour boundary', () => {
    const result = computeDurationMinutes(
      '2026-04-21T09:45:00.000Z',
      '2026-04-21T10:15:00.000Z',
    );
    expect(result).toBe(30);
  });

  it('returns 0 for a zero-length session', () => {
    const result = computeDurationMinutes(
      '2026-04-21T10:00:00.000Z',
      '2026-04-21T10:00:00.000Z',
    );
    expect(result).toBe(0);
  });

  it('handles sub-second precision (rounds to 1 decimal)', () => {
    // 90 seconds = 1.5 minutes
    const result = computeDurationMinutes(
      '2026-04-21T10:00:00.000Z',
      '2026-04-21T10:01:30.000Z',
    );
    expect(result).toBe(1.5);
  });

  it('computes a multi-hour session', () => {
    const result = computeDurationMinutes(
      '2026-04-21T08:00:00.000Z',
      '2026-04-21T11:30:00.000Z',
    );
    expect(result).toBe(210);
  });
});
