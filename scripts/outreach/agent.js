import 'dotenv/config';
import { appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import { google } from 'googleapis';
import { initDb, insertListing, getExistingUrls, updateDraft, getPendingDrafts, resetDrafts } from './db.js';
import { ensureAuth } from './gmail.js';
import { MARKETS } from './markets.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECISIONS_LOG  = resolve(__dirname, 'decisions.log');
const MANUAL_LOOKUP  = resolve(__dirname, 'manual_lookup.txt');
const USER_AGENT     = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const anthropic = new Anthropic();
let db; // set in main() via initDb()

// ── RUN-LEVEL STATS ──────────────────────────────────────────────────────────

const stats = {
  marketsRun:          [],
  listingsPerMarket:   {},   // zipcode → count
  emailsFromRedfin:    0,
  emailsFromBrokerage: 0,
  emailsNotFound:      0,
  draftsCreated:       0,
  errors:              [],
};

// ── TOOL DEFINITIONS ─────────────────────────────────────────────────────────

const tools = [
  {
    name: 'scrapeRedfin',
    description:
      'Scrape stale listings from Redfin for a given zipcode. ' +
      'Uses two separate Playwright browser sessions: Session 1 collects listing URLs ' +
      'from the search page then closes the browser completely; Session 2 opens a fresh ' +
      'browser and visits each listing page individually waiting for the agent ' +
      'section is fully hydrated, with 3–5 s random delays between visits. ' +
      'Inserts new listings into SQLite (INSERT OR IGNORE by redfin_url). ' +
      'Returns { listings, scraped, skipped, possibleBlock }. ' +
      'If possibleBlock is true, zero URLs were found — Redfin may be blocking; try scrapeZillow.',
    input_schema: {
      type: 'object',
      properties: {
        zipcode: { type: 'string', description: 'ZIP code to search, e.g. "90405"' },
        minDOM:  { type: 'number', description: 'Minimum days on market (30 = 1mo filter)' },
      },
      required: ['zipcode', 'minDOM'],
    },
  },

  {
    name: 'scrapeZillow',
    description:
      'Fallback scraper when Redfin blocks. Attempts to scrape stale listings from Zillow for a zipcode. ' +
      'Same two-session Playwright pattern with domcontentloaded and 3–5 s delays. ' +
      'Returns { listings, scraped, skipped, possibleBlock }. ' +
      'NOTE: If this also returns possibleBlock: true, log the market and move on.',
    input_schema: {
      type: 'object',
      properties: {
        zipcode: { type: 'string', description: 'ZIP code to search' },
        minDOM:  { type: 'number', description: 'Minimum days on market' },
      },
      required: ['zipcode', 'minDOM'],
    },
  },

  {
    name: 'findEmailOnBrokerageSite',
    description:
      'Attempt to find a listing agent\'s email by visiting their profile page on the brokerage website. ' +
      'Infers the brokerage domain from a known lookup map (common SM and SLC brokerages) with a ' +
      'kebab-slug fallback. Tries URL patterns: /agent/{slug}, /agents/{slug}, /team/{slug}, /{slug}. ' +
      'Regex-extracts the first valid email address from the page HTML. ' +
      'Returns { email, found } — found is false when no email can be located.',
    input_schema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Full name of the listing agent' },
        brokerage: { type: 'string', description: 'Brokerage name as scraped from Redfin/Zillow' },
      },
      required: ['agentName', 'brokerage'],
    },
  },

  {
    name: 'draftEmail',
    description:
      'Generate a personalized cold outreach email for a listing agent using claude-sonnet-4-20250514. ' +
      'Subject is always: "Why are buyers walking away from {address}?". ' +
      'Body: 4–5 sentences, leads with address + DOM, mentions Flypost using the phrase ' +
      '"honest reactions they won\'t share to your face but will leave in a ballot box", ' +
      'includes "Works next weekend.", signs off as Bronco. No HTML, no bullets, no pricing. ' +
      'Returns { subject, body }.',
    input_schema: {
      type: 'object',
      properties: {
        address:   { type: 'string', description: 'Full street address of the listing' },
        dom:       { type: 'number', description: 'Days on market' },
        agentName: { type: 'string', description: 'Full name of the listing agent' },
      },
      required: ['address', 'dom', 'agentName'],
    },
  },

  {
    name: 'saveGmailDraft',
    description:
      'Save an email as a Gmail draft using the existing OOB OAuth flow. ' +
      'Sends plain text — never HTML. Marks draft_created = 1 in SQLite for the listing. ' +
      'Returns { success, draftId }. ' +
      'IMPORTANT: never call this without a verified email address.',
    input_schema: {
      type: 'object',
      properties: {
        to:         { type: 'string', description: 'Recipient email address' },
        subject:    { type: 'string', description: 'Email subject line' },
        body:       { type: 'string', description: 'Plain-text email body' },
        redfin_url: { type: 'string', description: 'Listing URL — used as DB key to mark draft_created' },
      },
      required: ['to', 'subject', 'body', 'redfin_url'],
    },
  },

  {
    name: 'readDB',
    description:
      'Run a read-only SQL SELECT against outreach.sqlite. ' +
      'Use this to check existing listings, find pending emails, verify draft status, etc. ' +
      'Returns { rows }.',
    input_schema: {
      type: 'object',
      properties: {
        query:  { type: 'string', description: 'SQL SELECT statement' },
        params: {
          type: 'array',
          items: {},
          description: 'Optional positional parameters (? placeholders)',
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'writeDB',
    description:
      'Execute a write SQL statement (INSERT, UPDATE, DELETE) against outreach.sqlite. ' +
      'Returns { changes }.',
    input_schema: {
      type: 'object',
      properties: {
        sql:    { type: 'string', description: 'SQL write statement' },
        params: {
          type: 'array',
          items: {},
          description: 'Optional positional parameters (? placeholders)',
        },
      },
      required: ['sql'],
    },
  },

  {
    name: 'logDecision',
    description:
      'Append a timestamped decision record to decisions.log. ' +
      'Call this whenever you choose a fallback, skip a listing, or make a notable judgment call. ' +
      'Returns { logged: true }.',
    input_schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string', description: 'Why this decision was made' },
        action:    { type: 'string', description: 'What action is being taken as a result' },
        result:    { type: 'string', description: 'Outcome or status (can be "pending")' },
      },
      required: ['reasoning', 'action', 'result'],
    },
  },

  {
    name: 'flagForManualLookup',
    description:
      'Append an entry to manual_lookup.txt when an agent email cannot be found automatically. ' +
      'Use this as the final step after both Redfin and brokerage-site lookups fail. ' +
      'Returns { flagged: true }.',
    input_schema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Full name of the agent' },
        address:   { type: 'string', description: 'Property address' },
        reason:    { type: 'string', description: 'Why the email could not be found automatically' },
      },
      required: ['agentName', 'address', 'reason'],
    },
  },
];

// ── BROKERAGE DOMAIN MAP ─────────────────────────────────────────────────────

const BROKERAGE_DOMAIN_MAP = {
  // Santa Monica / LA
  'compass':                          'compass.com',
  'berkshire hathaway homeservices':  'bhhscalifornia.com',
  'berkshire hathaway':               'bhhscalifornia.com',
  'coldwell banker':                  'coldwellbanker.com',
  'keller williams':                  'kw.com',
  'sotheby':                          'sothebysrealty.com',
  'douglas elliman':                  'elliman.com',
  'century 21':                       'century21.com',
  're/max':                           'remax.com',
  'remax':                            'remax.com',
  'exp realty':                       'exprealty.com',
  'exp':                              'exprealty.com',
  'hilton & hyland':                  'hiltonhyland.com',
  'the agency':                       'theagencyre.com',
  'pardee':                           'pardeehomes.com',
  'strand hill':                      'strandhill.com',
  'vista sotheby':                    'vistasothebysrealty.com',
  // Salt Lake City / Sugar House
  'equity real estate':               'equityutah.com',
  'windermere':                       'windermere.com',
  'summit realty':                    'summitrealtyllc.com',
  'fathom realty':                    'fathomrealty.com',
  'real broker':                      'onereal.com',
  'utah real estate':                 'utahrealestate.com',
  'century 21 everest':               'c21everest.com',
};

function inferDomain(brokerage) {
  if (!brokerage) return null;
  const lower = brokerage.toLowerCase();
  for (const [key, domain] of Object.entries(BROKERAGE_DOMAIN_MAP)) {
    if (lower.includes(key)) return domain;
  }
  // Slug fallback: first word + .com
  const slug = lower.replace(/[^a-z0-9]+/g, '').slice(0, 30);
  return slug ? `${slug}.com` : null;
}

function toKebab(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── PLAYWRIGHT HELPERS ───────────────────────────────────────────────────────

function newBrowserContext(browser) {
  return browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
}

async function collectListingUrls(page, searchUrl) {
  const urls = new Set();
  let pageNum = 1;

  while (true) {
    const pageUrl = pageNum === 1 ? searchUrl : `${searchUrl}/page-${pageNum}`;
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.HomeCardContainer', { timeout: 15000 }).catch(() => {});

    const links = await page.$$eval(
      'a[href*="/home/"]',
      (els) => els.map((el) => el.href).filter((h) => /\/home\/\d+/.test(h)),
    );

    if (links.length === 0) break;

    const before = urls.size;
    links.forEach((l) => urls.add(l.split('?')[0]));
    if (urls.size === before && pageNum > 1) break;

    const hasNext = await page.$('.PaginationButton--next:not([disabled])');
    if (!hasNext) break;

    pageNum++;
    await page.waitForTimeout(1500 + Math.random() * 1000);
  }

  return [...urls];
}

async function extractListingData(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('[data-rf-test-id="agentInfoItem-agentDisplay"]', { timeout: 15000 }).catch(() => {});

    const data = await page.evaluate(() => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;

      const address =
        getText('.street-address') ||
        getText('[data-rf-test-id="abp-streetLine"]') ||
        getText('h1.address');

      let dom = null;
      const domEl = [...document.querySelectorAll('*')].find(
        (el) => el.children.length === 0 && /\d+\s+day/i.test(el.textContent),
      );
      if (domEl) {
        const match = domEl.textContent.match(/(\d+)\s+day/i);
        if (match) dom = parseInt(match[1], 10);
      }

      const list_price =
        getText('.price') ||
        getText('[data-rf-test-id="abp-price"]') ||
        getText('.statsValue');

      const agentSection = document.querySelector(
        '[data-rf-test-id="agentInfoItem-agentDisplay"]',
      );

      const agent_name =
        agentSection
          ?.querySelector('span.agent-basic-details--heading > span')
          ?.textContent?.trim() ?? null;

      const brokerage =
        agentSection
          ?.querySelector('span.agent-basic-details--broker')
          ?.textContent?.replace(/[•·]/g, '')
          .trim() ?? null;

      const phoneRaw =
        agentSection
          ?.querySelector('[data-rf-test-id="agentInfoItem-agentPhoneNumber"]')
          ?.textContent?.trim() ?? null;
      const agent_phone = phoneRaw
        ? phoneRaw.replace(/\s*\(agent\)/i, '').trim()
        : null;

      // Confirmed selector: div.email-addresses span:last-child
      const emailRaw =
        agentSection
          ?.querySelector('div.email-addresses span:last-child')
          ?.textContent?.trim() ?? null;
      const agent_email = emailRaw
        ? emailRaw.replace(/\s*\(agent\)/i, '').trim().toLowerCase()
        : null;

      return { address, dom, list_price, agent_name, brokerage, agent_phone, agent_email };
    });

    return { redfin_url: url, ...data };
  } catch (err) {
    console.error(`  [scrapeRedfin] Error on ${url}: ${err.message}`);
    return null;
  }
}

// ── TOOL IMPLEMENTATIONS ─────────────────────────────────────────────────────

async function toolScrapeRedfin({ zipcode, minDOM }) {
  const domFilter = minDOM >= 90 ? '3mo' : minDOM >= 60 ? '2mo' : '1mo';
  const searchUrl = `https://www.redfin.com/zipcode/${zipcode}/filter/min-days-on-market=${domFilter}`;

  // Session 1 — collect URLs, then close browser completely
  let urls;
  {
    console.log(`[scrapeRedfin] Session 1: collecting URLs for ZIP ${zipcode}...`);
    const browser = await chromium.launch({ headless: true });
    const ctx = await newBrowserContext(browser);
    const page = await ctx.newPage();
    try {
      urls = await collectListingUrls(page, searchUrl);
    } finally {
      await browser.close();
    }
    console.log(`[scrapeRedfin] Found ${urls.length} listing URLs`);
  }

  if (urls.length === 0) {
    return { listings: [], scraped: 0, skipped: 0, possibleBlock: true };
  }

  const existing = getExistingUrls();
  const newUrls  = urls.filter((u) => !existing.has(u));
  const alreadyIn = urls.length - newUrls.length;
  console.log(`[scrapeRedfin] ${newUrls.length} new to scrape (${alreadyIn} already in DB)`);

  if (newUrls.length === 0) {
    return { listings: [], scraped: 0, skipped: alreadyIn, possibleBlock: false };
  }

  // Session 2 — fresh browser, one context per listing
  const listings = [];
  let scraped = 0;
  let skipped = alreadyIn;

  console.log('[scrapeRedfin] Session 2: extracting listing details...');
  const browser = await chromium.launch({ headless: true });
  try {
    for (let i = 0; i < newUrls.length; i++) {
      const url = newUrls[i];
      console.log(`[scrapeRedfin] (${i + 1}/${newUrls.length}) ${url}`);
      const ctx  = await newBrowserContext(browser);
      const page = await ctx.newPage();
      try {
        const data = await extractListingData(page, url);
        if (data) {
          if (insertListing(data)) {
            scraped++;
            listings.push(data);
            // Count email source for stats
            if (data.agent_email) stats.emailsFromRedfin++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      } finally {
        await ctx.close();
      }

      if (i < newUrls.length - 1) {
        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
      }
    }
  } finally {
    await browser.close();
  }

  // Track per-market listing count
  stats.listingsPerMarket[zipcode] = (stats.listingsPerMarket[zipcode] ?? 0) + scraped;

  return { listings, scraped, skipped, possibleBlock: false };
}

async function toolScrapeZillow({ zipcode, minDOM }) {
  // Stub — Zillow scraper not yet implemented.
  // Returns the correct shape so Claude can handle the fallback gracefully.
  console.log(`[scrapeZillow] ZIP ${zipcode} — Zillow scraper not yet implemented`);
  return {
    listings: [],
    scraped: 0,
    skipped: 0,
    possibleBlock: true,
    error: 'Zillow scraper not yet implemented',
  };
}

async function toolFindEmailOnBrokerageSite({ agentName, brokerage }) {
  const domain = inferDomain(brokerage);
  if (!domain) {
    return { email: null, found: false, reason: `No domain mapping for brokerage: "${brokerage}"` };
  }

  const slug     = toKebab(agentName);
  const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi;
  const patterns = [
    `https://${domain}/agent/${slug}`,
    `https://${domain}/agents/${slug}`,
    `https://${domain}/team/${slug}`,
    `https://${domain}/${slug}`,
    `https://www.${domain}/agent/${slug}`,
    `https://www.${domain}/agents/${slug}`,
  ];

  for (const url of patterns) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const html    = await res.text();
      const matches = html.match(EMAIL_RE);
      if (matches) {
        const email = matches.find(
          (e) =>
            !e.includes('example.com') &&
            !e.includes('domain.com') &&
            !e.endsWith('.png'),
        );
        if (email) {
          stats.emailsFromBrokerage++;
          return { email: email.toLowerCase(), found: true };
        }
      }
    } catch {
      // try next pattern
    }
  }

  return { email: null, found: false, reason: `No email found on ${domain} for "${agentName}"` };
}

async function toolDraftEmail({ address, dom, agentName }) {
  const firstName = agentName?.split(' ')[0] ?? 'there';
  const addr = address ?? 'your listing';
  const days = dom ?? '30+';

  const subject = `Why are buyers walking away from ${addr}?`;

  const body = `Hi ${firstName},

${addr} has been on for ${days} days. Buyers are walking through and not telling you why they're leaving.

Flypost captures anonymous buyer feedback at open houses — honest reactions they won't share to your face but will leave in a ballot box.

Works next weekend.

Bronco @ Flypost`;

  return { subject, body };
}

async function toolSaveGmailDraft({ to, subject, body, redfin_url }) {
  try {
    const auth   = await ensureAuth();
    const gmail  = google.gmail({ version: 'v1', auth });

    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');

    const raw = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.drafts.create({
      userId:      'me',
      requestBody: { message: { raw } },
    });

    updateDraft(redfin_url);
    stats.draftsCreated++;

    console.log(`  [gmail] Draft saved for ${to} — "${subject}"`);
    return { success: true, draftId: result.data.id };
  } catch (err) {
    stats.errors.push(`saveGmailDraft(${to}): ${err.message}`);
    return { success: false, error: err.message };
  }
}

function toolReadDB({ query, params = [] }) {
  try {
    const rows = db.prepare(query).all(...params);
    return { rows };
  } catch (err) {
    return { rows: [], error: err.message };
  }
}

function toolWriteDB({ sql, params = [] }) {
  try {
    const result = db.prepare(sql).run(...params);
    return { changes: result.changes };
  } catch (err) {
    return { changes: 0, error: err.message };
  }
}

function toolLogDecision({ reasoning, action, result }) {
  const line = `[${new Date().toISOString()}] REASONING: ${reasoning} | ACTION: ${action} | RESULT: ${result}\n`;
  appendFileSync(DECISIONS_LOG, line, 'utf8');
  console.log(`  [decision] ${action}`);
  return { logged: true };
}

function toolFlagForManualLookup({ agentName, address, reason }) {
  const line = `[${new Date().toISOString()}] AGENT: ${agentName} | ADDRESS: ${address} | REASON: ${reason}\n`;
  appendFileSync(MANUAL_LOOKUP, line, 'utf8');
  stats.emailsNotFound++;
  console.log(`  [manual] Flagged: ${agentName} @ ${address}`);
  return { flagged: true };
}

// ── TOOL DISPATCHER ──────────────────────────────────────────────────────────

async function executeTool(name, input) {
  switch (name) {
    case 'scrapeRedfin':             return await toolScrapeRedfin(input);
    case 'scrapeZillow':             return await toolScrapeZillow(input);
    case 'findEmailOnBrokerageSite': return await toolFindEmailOnBrokerageSite(input);
    case 'draftEmail':               return await toolDraftEmail(input);
    case 'saveGmailDraft':           return await toolSaveGmailDraft(input);
    case 'readDB':                   return toolReadDB(input);
    case 'writeDB':                  return toolWriteDB(input);
    case 'logDecision':              return toolLogDecision(input);
    case 'flagForManualLookup':      return toolFlagForManualLookup(input);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── AGENT LOOP ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an outreach research agent for Flypost, a real estate tech startup. Your goal is to find stale listings in active markets, get a contactable email for each listing agent, generate a personalized cold email draft, and save it to Gmail.

Use tools in whatever order makes sense. When something fails, follow the fallback chain. Log every significant decision with your reasoning.

Rules:
- Never draft or save an email without a verified email address
- Never send — only save to Gmail drafts
- Redfin blocks (possibleBlock: true) → try scrapeZillow, then logDecision and move to next market
- Email not on Redfin → try findEmailOnBrokerageSite → if still not found, flagForManualLookup and move on
- Skip agents already in DB with draft_created = 1
- Log every fallback with reasoning via logDecision`;

async function runAgentLoop(userPrompt) {
  const messages = [{ role: 'user', content: userPrompt }];

  while (true) {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Append assistant turn
    messages.push({ role: 'assistant', content: response.content });

    // Print any text the model produced this turn
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        console.log('\n[agent] ' + block.text.trim());
      }
    }

    if (response.stop_reason === 'end_turn') break;

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
      const toolResults   = [];

      for (const block of toolUseBlocks) {
        const inputPreview = JSON.stringify(block.input).slice(0, 80);
        console.log(`\n[agent] → ${block.name}(${inputPreview})`);

        let result;
        try {
          result = await executeTool(block.name, block.input);
        } catch (err) {
          result = { error: err.message };
          stats.errors.push(`${block.name}: ${err.message}`);
        }

        const resultPreview = JSON.stringify(result).slice(0, 120);
        console.log(`[agent] ← ${resultPreview}`);

        toolResults.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    } else {
      // Unexpected stop reason — bail out
      console.error(`[agent] Unexpected stop_reason: ${response.stop_reason}`);
      break;
    }
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function runDraftsOnly() {
  console.log('=== Flypost Outreach Agent — Drafts Only ===\n');

  db = initDb();

  const pending = getPendingDrafts();
  console.log(`Found ${pending.length} listing(s) with email but no draft.\n`);

  if (pending.length === 0) return;

  for (const listing of pending) {
    const { subject, body } = await toolDraftEmail({
      address:   listing.address,
      dom:       listing.dom,
      agentName: listing.agent_name,
    });

    console.log(`  Drafting for ${listing.agent_name} — ${listing.address}`);

    const result = await toolSaveGmailDraft({
      to:         listing.agent_email,
      subject,
      body,
      redfin_url: listing.redfin_url,
    });

    if (result.success) {
      console.log(`  ✓ Draft saved`);
    } else {
      console.log(`  ✗ Draft failed: ${result.error ?? 'unknown error'}`);
    }
  }

  console.log(`\nDone. ${stats.draftsCreated}/${pending.length} drafts created.`);

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.forEach((e) => console.log(`  - ${e}`));
  }
}

async function main() {
  if (process.argv.includes('--reset-drafts')) {
    db = initDb();
    const count = resetDrafts();
    console.log(`Reset draft_created = 0 for ${count} listing(s).`);
    return;
  }

  const draftsOnly = process.argv.includes('--drafts-only');
  if (draftsOnly) return runDraftsOnly();

  console.log('=== Flypost Outreach Agent (AI) ===\n');

  db = initDb();

  const activeMarkets = MARKETS.filter((m) => m.active);
  if (activeMarkets.length === 0) {
    console.log('No active markets in markets.config.js. Set active: true on at least one market.');
    return;
  }

  stats.marketsRun = activeMarkets.map((m) => m.name);

  const marketList = activeMarkets
    .map((m) => `- ${m.name} (ZIP ${m.zipcode}, min DOM: ${m.min_dom})`)
    .join('\n');

  const userPrompt =
    `Find stale listings and create Gmail draft outreach for all active markets. ` +
    `Adapt if sources block. Log decisions. When done, print a summary.\n\n` +
    `Active markets:\n${marketList}`;

  await runAgentLoop(userPrompt);

  // ── Print JS-level summary ────────────────────────────────────────────────
  console.log('\n=== Run Summary ===');
  console.log(`Markets run          : ${stats.marketsRun.join(', ')}`);

  for (const [zip, count] of Object.entries(stats.listingsPerMarket)) {
    const name = MARKETS.find((m) => m.zipcode === zip)?.name ?? zip;
    console.log(`Listings scraped     : ${count} (${name})`);
  }

  console.log(`Emails from Redfin   : ${stats.emailsFromRedfin}`);
  console.log(`Emails from brokerage: ${stats.emailsFromBrokerage}`);
  console.log(`Emails not found     : ${stats.emailsNotFound}`);
  console.log(`Gmail drafts created : ${stats.draftsCreated}`);

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.forEach((e) => console.log(`  - ${e}`));
  }

  console.log('\nLog files:');
  console.log(`  decisions.log   → ${DECISIONS_LOG}`);
  console.log(`  manual_lookup   → ${MANUAL_LOOKUP}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
