// Input validation utilities for API endpoints
// Used across all route handlers for request validation

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isValidDateRange(from: string, to: string): boolean {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  return !isNaN(fromDate.getTime()) && !isNaN(toDate.getTime()) && fromDate <= toDate;
}
