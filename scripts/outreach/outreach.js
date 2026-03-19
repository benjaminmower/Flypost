import 'dotenv/config';
import { initDb, getStats } from './db.js';
import { scrapeRedfin } from './scrape.js';
import { findEmails } from './findEmail.js';
import { generateDrafts } from './draftEmail.js';
import { saveGmailDraft } from './gmail.js';

async function main() {
  console.log('=== Flypost Outreach Agent ===\n');

  // 1. Init DB
  initDb();

  // 2. Step 1: Scrape Redfin for stale Santa Monica listings
  console.log('--- Step 1: Scraping Redfin ---');
  const { scraped, skipped } = await scrapeRedfin();
  console.log(`  Scraped: ${scraped} new | Skipped: ${skipped} (already in DB)\n`);

  // 3. Step 2: Find agent emails
  console.log('--- Step 2: Finding Agent Emails ---');
  const { fromRedfin, fromBrokerage, notFound } = await findEmails();
  console.log(`  From Redfin: ${fromRedfin} | From brokerage site: ${fromBrokerage} | Not found: ${notFound}\n`);

  // 4. Steps 3+4: Generate AI drafts + save to Gmail
  console.log('--- Steps 3+4: Generating Drafts + Saving to Gmail ---');
  const drafts = await generateDrafts();

  let draftsSaved = 0;
  let draftsErrored = 0;

  for (const draft of drafts) {
    try {
      await saveGmailDraft(draft);
      draftsSaved++;
    } catch (err) {
      console.error(`  [gmail] Failed for ${draft.email}: ${err.message}`);
      draftsErrored++;
    }
  }

  console.log(`  Drafts saved: ${draftsSaved} | Errors: ${draftsErrored}\n`);

  // 5. Summary
  console.log('--- Summary ---');
  const stats = getStats();
  console.log(`  Total listings in DB : ${stats.total}`);
  console.log(`  Emails from Redfin   : ${stats.email_from_redfin}`);
  console.log(`  Emails from brokerage: ${stats.email_from_brokerage}`);
  console.log(`  Emails not found     : ${stats.email_not_found}`);
  console.log(`  Gmail drafts created : ${stats.drafts_created}`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
