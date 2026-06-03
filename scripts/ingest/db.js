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
      share_url        TEXT,
      proof_event_url  TEXT,
      proof_near_url   TEXT,
      verified_at      TEXT,
      published_at     TEXT    DEFAULT (datetime('now')),
      UNIQUE(source_url, start_date)
    )
  `)

  for (const statement of [
    'ALTER TABLE ingested_events ADD COLUMN share_url TEXT',
    'ALTER TABLE ingested_events ADD COLUMN proof_event_url TEXT',
    'ALTER TABLE ingested_events ADD COLUMN proof_near_url TEXT',
    'ALTER TABLE ingested_events ADD COLUMN verified_at TEXT',
  ]) {
    try {
      db.exec(statement)
    } catch (error) {
      if (!String(error.message || '').includes('duplicate column name')) {
        throw error
      }
    }
  }

  return db
}

export function checkDuplicate(sourceUrl, startDate) {
  const row = db
    .prepare('SELECT id FROM ingested_events WHERE source_url = ? AND start_date = ?')
    .get(sourceUrl, startDate)
  return { isDuplicate: !!row }
}

export function markIngested(sourceUrl, startDate, eventId, sourceName, eventName, proof = {}) {
  db
    .prepare(`
      INSERT OR IGNORE INTO ingested_events (
        source_url,
        source_name,
        event_name,
        start_date,
        flypost_event_id,
        share_url,
        proof_event_url,
        proof_near_url,
        verified_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      sourceUrl,
      sourceName,
      eventName,
      startDate,
      eventId,
      proof.shareUrl || null,
      proof.proofEventUrl || null,
      proof.proofNearUrl || null,
      proof.verifiedAt || null
    )
}
