export function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

export function logDebug(msg: string) {
  if (process.env.DEBUG) {
    console.debug(msg);
  }
}
