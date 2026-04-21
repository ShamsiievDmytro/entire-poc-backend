import express from 'express';
import cors from 'cors';
import type Database from 'better-sqlite3';
import { statusRoutes } from './routes/status.js';
import { ingestRoutes } from './routes/ingest.js';
import { chartRoutes } from './routes/charts.js';
import { sessionRoutes } from './routes/sessions.js';
import { gitaiRoutes } from './routes/gitai.js';
import { errorHandler } from './middleware/error.js';

export function createServer(db: Database.Database) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.use('/api', statusRoutes(db));
  app.use('/api', ingestRoutes(db));
  app.use('/api', chartRoutes(db));
  app.use('/api', sessionRoutes(db));
  app.use('/api', gitaiRoutes(db));

  app.use(errorHandler);

  return app;
}
