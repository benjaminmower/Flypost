import { chromium } from 'playwright';
import { insertListing } from './db.js';

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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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

      // Agent info — Redfin listing agent section
      const agentSection = document.querySelector('.agent-basic-info, .listing-agent, [data-rf-test-id="listing-agent"]');
      const agent_name = agentSection?.querySelector('.agent-name, .name')?.textContent?.trim()
        ?? getText('.listing-agent-name')
        ?? null;
      const brokerage = agentSection?.querySelector('.agent-company, .brokerage')?.textContent?.trim()
        ?? getText('.listing-agent-brokerage')
        ?? null;

      // Phone
      let agent_phone = null;
      const phoneEl = [...document.querySelectorAll('a[href^="tel:"]')];
      if (phoneEl.length) agent_phone = phoneEl[0].href.replace('tel:', '');

      // Email — rarely present on Redfin but check anyway
      let agent_email = null;
      const emailEl = document.querySelector('a[href^="mailto:"]');
      if (emailEl) agent_email = emailEl.href.replace('mailto:', '').split('?')[0];

      return { address, dom, list_price, agent_name, brokerage, agent_phone, agent_email };
    });

    return { redfin_url: url, ...data };
  } catch (err) {
    console.error(`  [scrape] Error on ${url}: ${err.message}`);
    return null;
  }
}

export async function scrapeRedfin() {
  console.log('[scrape] Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  let scraped = 0;
  let skipped = 0;

  try {
    console.log('[scrape] Collecting listing URLs...');
    const urls = await collectListingUrls(page);
    console.log(`[scrape] Found ${urls.length} listing URLs`);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[scrape] (${i + 1}/${urls.length}) ${url}`);

      const data = await extractListingData(page, url);
      if (!data) { skipped++; continue; }

      const inserted = insertListing(data);
      if (inserted) {
        scraped++;
      } else {
        skipped++;
      }

      // Polite delay
      await page.waitForTimeout(1000 + Math.random() * 1000);
    }
  } finally {
    await browser.close();
  }

  return { scraped, skipped };
}
