import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = join(__dirname, 'schema.sql');
  let schema: string;
  try {
    schema = readFileSync(schemaPath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read schema file at ${schemaPath}: ${err}`);
  }

  try {
    db.exec(schema); // db.exec runs SQL statements — this is not shell execution
  } catch (err) {
    throw new Error(`Failed to execute schema SQL: ${err}`);
  }

  return db;
}
