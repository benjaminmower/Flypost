import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'ingest.sqlite')

let db

export function initDb() {
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS ingested_events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url       TEXT    NOT NULL,
      source_name      TEXT,
      event_name       TEXT,
      start_date       TEXT,
      flypost_event_id TEXT,
      published_at     TEXT    DEFAULT (datetime('now')),
      UNIQUE(source_url, start_date)
    )
  `)

  return db
}

export function checkDuplicate(sourceUrl, startDate) {
  const row = db
    .prepare('SELECT id FROM ingested_events WHERE source_url = ? AND start_date = ?')
    .get(sourceUrl, startDate)
  return { isDuplicate: !!row }
}

export function markIngested(sourceUrl, startDate, eventId, sourceName, eventName) {
  db
    .prepare(`
      INSERT OR IGNORE INTO ingested_events (source_url, source_name, event_name, start_date, flypost_event_id)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(sourceUrl, sourceName, eventName, startDate, eventId)
}
