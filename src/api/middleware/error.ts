import type { Request, Response, NextFunction } from 'express';
import { log } from '../../utils/logger.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  log('error', 'Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: err.message });
}
