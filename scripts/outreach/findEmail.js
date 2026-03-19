import { getPendingEmailLookup, updateEmail } from './db.js';

const EMAIL_REGEX = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi;

// Known brokerage → domain mappings
const BROKERAGE_DOMAIN_MAP = {
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
};

function inferDomain(brokerage) {
  if (!brokerage) return null;
  const lower = brokerage.toLowerCase();
  for (const [key, domain] of Object.entries(BROKERAGE_DOMAIN_MAP)) {
    if (lower.includes(key)) return domain;
  }
  // Slug fallback: take first word, append .com
  const slug = lower.replace(/[^a-z0-9]+/g, '').slice(0, 30);
  return slug ? `${slug}.com` : null;
}

function toKebab(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function findEmailOnBrokerageSite(agent_name, domain) {
  const slug = toKebab(agent_name);
  const patterns = [
    `https://${domain}/agent/${slug}`,
    `https://${domain}/agents/${slug}`,
    `https://${domain}/team/${slug}`,
    `https://${domain}/${slug}`,
    `https://www.${domain}/agent/${slug}`,
    `https://www.${domain}/agents/${slug}`,
  ];

  for (const url of patterns) {
    const html = await fetchText(url);
    if (!html) continue;
    const matches = html.match(EMAIL_REGEX);
    if (matches) {
      // Filter out common false positives
      const email = matches.find(
        (e) => !e.includes('example.com') && !e.includes('domain.com') && !e.endsWith('.png')
      );
      if (email) return email.toLowerCase();
    }
  }
  return null;
}

export async function findEmails() {
  const rows = getPendingEmailLookup();
  console.log(`[findEmail] ${rows.length} listings pending email lookup`);

  let fromRedfin = 0;
  let fromBrokerage = 0;
  let notFound = 0;

  for (const row of rows) {
    // Already have email from Redfin scrape
    if (row.agent_email) {
      updateEmail(row.redfin_url, { agent_email: row.agent_email, email_source: 'redfin' });
      fromRedfin++;
      continue;
    }

    if (!row.agent_name) {
      updateEmail(row.redfin_url, { agent_email: null, email_source: 'not_found' });
      notFound++;
      continue;
    }

    const domain = inferDomain(row.brokerage);
    if (!domain) {
      console.log(`  [findEmail] No domain for brokerage: "${row.brokerage}" — skipping`);
      updateEmail(row.redfin_url, { agent_email: null, email_source: 'not_found' });
      notFound++;
      continue;
    }

    console.log(`  [findEmail] Looking up ${row.agent_name} on ${domain}...`);
    const email = await findEmailOnBrokerageSite(row.agent_name, domain);

    if (email) {
      updateEmail(row.redfin_url, { agent_email: email, email_source: 'brokerage_site' });
      console.log(`  [findEmail] Found: ${email}`);
      fromBrokerage++;
    } else {
      updateEmail(row.redfin_url, { agent_email: null, email_source: 'not_found' });
      notFound++;
    }
  }

  return { fromRedfin, fromBrokerage, notFound };
}
