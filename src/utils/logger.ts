/**
 * Structured JSON logger utility for the Git AI metrics backend.
 *
 * All output is written to stdout as a single-line JSON object so it can be
 * consumed by log-aggregation pipelines (e.g. Datadog, Loki, ELK) without
 * extra parsing configuration. Supports info, warn, and error log levels. Updated
 * 
 * Here is my new line
 *
 * @module logger
 */

/** Supported log severity levels. */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Emit a structured log entry to stdout.
 *
 * @param level   - Severity level of the message.
 * @param message - Human-readable description of the event.
 * @param data    - Optional key/value pairs to attach to the log entry.
 *
 * @example
 * log('info', 'Server started', { port: 3000 });
 * // → {"timestamp":"...","level":"info","message":"Server started","port":3000}
 */
export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Emit an error-level log entry, normalising the attached `Error` object into
 * a plain serialisable shape (message + optional stack trace).
 *
 * Use this helper instead of calling `log('error', ...)` directly whenever you
 * have an actual `Error` instance so that the stack is preserved in the log.
 *
 * @param message - Human-readable description of what went wrong.
 * @param error   - The caught error value (typed `unknown` to mirror catch-clause semantics).
 * @param data    - Optional additional key/value context.
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   logError('riskyOperation failed', err, { userId: 42 });
 * }
 */
export function logError(
  message: string,
  error: unknown,
  data?: Record<string, unknown>,
): void {
  const errorDetails: Record<string, unknown> =
    error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : { errorMessage: String(error) };

  log('error', message, { ...errorDetails, ...data });
}
