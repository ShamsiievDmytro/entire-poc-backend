export function parseTimestamp(value: string | number | undefined | null): string | null {
  if (value == null) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
