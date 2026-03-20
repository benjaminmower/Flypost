import { chromium } from 'playwright';
import { insertListing, getExistingUrls } from './db.js';

const SEARCH_URL = 'https://www.redfin.com/zipcode/90405/filter/min-days-on-market=1mo';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

async function collectListingUrls(page) {
  const urls = new Set();
  let pageNum = 1;

  while (true) {
    const pageUrl = pageNum === 1
      ? SEARCH_URL
      : `${SEARCH_URL}/page-${pageNum}`;

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    await autoScroll(page);
    await page.waitForTimeout(1000);

    const links = await page.$$eval(
      'a[href*="/home/"]',
      (els) => els.map((el) => el.href).filter((h) => /\/home\/\d+/.test(h))
    );

    if (links.length === 0) break;

    const before = urls.size;
    links.forEach((l) => urls.add(l.split('?')[0]));

    // If no new URLs were added, we've hit the last page
    if (urls.size === before && pageNum > 1) break;

    // Check if a next-page button exists
    const hasNext = await page.$('.PaginationButton--next:not([disabled])');
    if (!hasNext) break;

    pageNum++;
    await page.waitForTimeout(1500 + Math.random() * 1000);
  }

  return [...urls];
}

async function extractListingData(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const data = await page.evaluate(() => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;

      // Address
      const address = getText('.street-address') || getText('[data-rf-test-id="abp-streetLine"]') || getText('h1.address');

      // DOM — look for "X days on Redfin" style text
      let dom = null;
      const domEl = [...document.querySelectorAll('*')].find(
        (el) => el.children.length === 0 && /\d+\s+day/i.test(el.textContent)
      );
      if (domEl) {
        const match = domEl.textContent.match(/(\d+)\s+day/i);
        if (match) dom = parseInt(match[1], 10);
      }

      // Price
      const list_price = getText('.price') || getText('[data-rf-test-id="abp-price"]') || getText('.statsValue');

      // Agent info — first agentInfoItem-agentDisplay block (listing agent)
      const agentSection = document.querySelector('[data-rf-test-id="agentInfoItem-agentDisplay"]');

      const agent_name = agentSection
        ?.querySelector('span.agent-basic-details--heading > span')
        ?.textContent?.trim() ?? null;

      // Strip bullet dot and surrounding whitespace from brokerage text
      const brokerage = agentSection
        ?.querySelector('span.agent-basic-details--broker')
        ?.textContent?.replace(/[•·]/g, '').trim() ?? null;

      // Phone — "310-998-7175 (agent)" → strip " (agent)"
      const phoneRaw = agentSection
        ?.querySelector('[data-rf-test-id="agentInfoItem-agentPhoneNumber"]')
        ?.textContent?.trim() ?? null;
      const agent_phone = phoneRaw ? phoneRaw.replace(/\s*\(agent\)/i, '').trim() : null;

      // Email — plain text node "bjorn@bjornfarrugia.com (agent)"
      let agent_email = null;
      const emailDiv = agentSection?.querySelector('div.email-addresses');
      if (emailDiv) {
        const match = emailDiv.textContent.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
        if (match) agent_email = match[0].toLowerCase();
      }

      return { address, dom, list_price, agent_name, brokerage, agent_phone, agent_email };
    });

    return { redfin_url: url, ...data };
  } catch (err) {
    console.error(`  [scrape] Error on ${url}: ${err.message}`);
    return null;
  }
}

async function newContext(browser) {
  return browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
}

export async function scrapeRedfin() {
  // Session 1: collect listing URLs, then close browser completely.
  // Keeping the search session alive poisons subsequent listing requests
  // with Redfin's bot-detection cookies.
  let urls;
  {
    console.log('[scrape] Session 1: collecting listing URLs...');
    const browser = await chromium.launch({ headless: true });
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    try {
      urls = await collectListingUrls(page);
    } finally {
      await browser.close(); // full close — no shared state leaks into Session 2
    }
    console.log(`[scrape] Found ${urls.length} listing URLs`);
  }

  const existing = getExistingUrls();
  const newUrls = urls.filter(u => !existing.has(u));
  console.log(`[scrape] ${newUrls.length} new to scrape (${urls.length - newUrls.length} already in DB)`);

  if (newUrls.length === 0) return { scraped: 0, skipped: urls.length };

  // Session 2: fresh browser with no search-page cookies.
  // Each listing gets its own context; 3-5s random delay between visits.
  let scraped = 0;
  let skipped = 0;

  console.log('[scrape] Session 2: extracting listing details...');
  const browser = await chromium.launch({ headless: true });
  try {
    for (let i = 0; i < newUrls.length; i++) {
      const url = newUrls[i];
      console.log(`[scrape] (${i + 1}/${newUrls.length}) ${url}`);

      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      try {
        const data = await extractListingData(page, url);
        if (!data) { skipped++; continue; }
        insertListing(data) ? scraped++ : skipped++;
      } finally {
        await ctx.close();
      }

      if (i < newUrls.length - 1) {
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
      }
    }
  } finally {
    await browser.close();
  }

  return { scraped, skipped };
}
