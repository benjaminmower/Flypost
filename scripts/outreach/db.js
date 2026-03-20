import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'outreach.sqlite');

let db;

export function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      redfin_url       TEXT    UNIQUE NOT NULL,
      address          TEXT,
      dom              INTEGER,
      list_price       TEXT,
      agent_name       TEXT,
      brokerage        TEXT,
      agent_phone      TEXT,
      agent_email      TEXT,
      email_source     TEXT,
      draft_created    INTEGER  DEFAULT 0,
      draft_created_at TEXT,
      scraped_at       TEXT     DEFAULT (datetime('now'))
    )
  `);

  return db;
}

export function insertListing({ redfin_url, address, dom, list_price, agent_name, brokerage, agent_phone, agent_email }) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO listings
      (redfin_url, address, dom, list_price, agent_name, brokerage, agent_phone, agent_email)
    VALUES
      (@redfin_url, @address, @dom, @list_price, @agent_name, @brokerage, @agent_phone, @agent_email)
  `);
  const result = stmt.run({ redfin_url, address, dom, list_price, agent_name, brokerage, agent_phone, agent_email });
  return result.changes > 0; // true = inserted, false = skipped (already exists)
}

export function updateEmail(redfin_url, { agent_email, email_source }) {
  db.prepare(`
    UPDATE listings SET agent_email = @agent_email, email_source = @email_source
    WHERE redfin_url = @redfin_url
  `).run({ redfin_url, agent_email, email_source });
}

export function updateDraft(redfin_url) {
  db.prepare(`
    UPDATE listings SET draft_created = 1, draft_created_at = datetime('now')
    WHERE redfin_url = @redfin_url
  `).run({ redfin_url });
}

export function getExistingUrls() {
  return new Set(
    db.prepare('SELECT redfin_url FROM listings').all().map(r => r.redfin_url)
  );
}

export function getPendingEmailLookup() {
  return db.prepare(`SELECT * FROM listings WHERE email_source IS NULL`).all();
}

export function getPendingDrafts() {
  return db.prepare(`
    SELECT * FROM listings WHERE agent_email IS NOT NULL AND draft_created = 0
  `).all();
}

export function resetDrafts() {
  return db.prepare(`UPDATE listings SET draft_created = 0, draft_created_at = NULL`).run().changes;
}

export function getStats() {
  return db.prepare(`
    SELECT
      COUNT(*)                                          AS total,
      SUM(CASE WHEN email_source = 'redfin'          THEN 1 ELSE 0 END) AS email_from_redfin,
      SUM(CASE WHEN email_source = 'brokerage_site'  THEN 1 ELSE 0 END) AS email_from_brokerage,
      SUM(CASE WHEN email_source = 'not_found'       THEN 1 ELSE 0 END) AS email_not_found,
      SUM(draft_created)                              AS drafts_created
    FROM listings
  `).get();
}
