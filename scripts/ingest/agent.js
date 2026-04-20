import 'dotenv/config'
import { appendFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { chromium } from 'playwright'
import { initDb, checkDuplicate as dbCheckDuplicate, markIngested as dbMarkIngested } from './db.js'
import { SOURCES } from './sources.config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DECISIONS_LOG = resolve(__dirname, 'decisions.log')
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const anthropic = new Anthropic()
const DRY_RUN = process.argv.includes('--dry-run')

// ── COST SAFEGUARDS ──────────────────────────────────────────────────────────

const tokenTracker = { inputTokens: 0, outputTokens: 0 }
const runStartTime = Date.now()
const MAX_SOURCES       = parseInt(process.env.MAX_SOURCES       || '10')
const MAX_TOKENS_PER_RUN = parseInt(process.env.MAX_TOKENS_PER_RUN || '500000')
const MAX_RUN_MS        = parseInt(process.env.MAX_RUN_MS        || '900000')
const FLYPOST_API_BASE  = process.env.FLYPOST_API_BASE  || ''
const FLYPOST_WRITE_TOKEN = process.env.FLYPOST_WRITE_TOKEN || ''

// ── RUN STATS ────────────────────────────────────────────────────────────────

const stats = {
  sourcesProcessed: 0,
  eventsFound:      0,
  duplicatesSkipped: 0,
  eventsPublished:  0,
  errors:           0,
}

// ── SOURCE QUEUE ─────────────────────────────────────────────────────────────

const visitedUrls  = new Set()   // tracks all URLs ever seen (queued or configured)
const pendingQueue = []           // drained by the agent loop via queueSource

// ── SUMMARY ──────────────────────────────────────────────────────────────────

let summaryPrinted = false

function printSummary() {
  if (summaryPrinted) return
  summaryPrinted = true
  const estimatedCost = (
    (tokenTracker.inputTokens * 3 + tokenTracker.outputTokens * 15) / 1_000_000
  ).toFixed(2)
  console.log('\n=== Run Summary ===')
  console.log(`Sources processed  : ${stats.sourcesProcessed}`)
  console.log(`Events found       : ${stats.eventsFound}`)
  console.log(`Duplicates skipped : ${stats.duplicatesSkipped}`)
  console.log(`Events published   : ${stats.eventsPublished}`)
  console.log(`Input tokens       : ${tokenTracker.inputTokens}`)
  console.log(`Output tokens      : ${tokenTracker.outputTokens}`)
  console.log(`Estimated cost     : $${estimatedCost}`)
  console.log(`Errors             : ${stats.errors}`)
}

process.on('exit', printSummary)
process.on('SIGINT', () => { printSummary(); process.exit(0) })

// ── BUDGET GUARDS ─────────────────────────────────────────────────────────────

function checkTokenBudget() {
  const total = tokenTracker.inputTokens + tokenTracker.outputTokens
  if (total > MAX_TOKENS_PER_RUN) {
    logDecision(
      'Token budget exceeded',
      'exit gracefully',
      `${total} tokens used, limit ${MAX_TOKENS_PER_RUN}`
    )
    process.exit(0)
  }
}

function checkTimeBudget() {
  const elapsed = Date.now() - runStartTime
  if (elapsed > MAX_RUN_MS) {
    logDecision(
      'Time budget exceeded',
      'exit gracefully',
      `${Math.round(elapsed / 1000)}s elapsed, limit ${MAX_RUN_MS / 1000}s`
    )
    process.exit(0)
  }
}

// ── TOOL IMPLEMENTATIONS ─────────────────────────────────────────────────────

const REDDIT_KEYWORD_RE = /event|trivia|happy hour|weekend|tonight|thursday|friday|saturday|sunday|weekly|every/i

async function fetchPage(url, sourceType) {
  // Reddit JSON path — plain fetch only, structured post list returned
  const isReddit = sourceType === 'reddit_json' ||
    (url.includes('reddit.com') && url.endsWith('.json'))

  if (isReddit) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Flypost/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      // Respectful 2s delay between Reddit API calls
      await new Promise(r => setTimeout(r, 2000))
      const posts = (data?.data?.children || []).map(child => {
        const p = child.data
        return {
          id: p.id,
          title: p.title,
          selftext: p.selftext,
          permalink: p.permalink,
          url: p.url,
          worthFetchingThread: REDDIT_KEYWORD_RE.test(p.title),
        }
      })
      stats.sourcesProcessed++
      return { posts, success: true }
    } catch (err) {
      stats.errors++
      return { posts: [], success: false }
    }
  }

  // Plain fetch first — fast path for server-rendered pages
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    })
    const text = await res.text()
    if (text && text.trim().length > 500) {
      stats.sourcesProcessed++
      return { html: text.slice(0, 50000), success: true }
    }
  } catch (_) {}

  // Fall back to Playwright for JS-rendered pages
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ userAgent: USER_AGENT })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    const html = await page.content()
    await browser.close()
    // 2–3s random delay between Playwright requests
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000))
    stats.sourcesProcessed++
    return { html: html.slice(0, 50000), success: true }
  } catch (err) {
    if (browser) await browser.close().catch(() => {})
    stats.errors++
    return { html: '', success: false }
  }
}

async function fetchRedditThread(postId, subreddit) {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Flypost/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    // Respectful 2s delay between Reddit API calls
    await new Promise(r => setTimeout(r, 2000))

    // Reddit returns [post listing, comments listing]
    const post = data[0]?.data?.children?.[0]?.data
    const comments = data[1]?.data?.children || []

    const postTitle = post?.title || ''
    const postBody  = post?.selftext || ''

    const commentBodies = comments
      .map(c => c.data?.body || '')
      .filter(body => body !== '[deleted]' && body !== '[removed]' && body.length >= 10)

    const text = [
      `POST: ${postTitle}`,
      postBody ? `\n${postBody}` : '',
      ...commentBodies.map(b => `\nCOMMENT: ${b}`),
    ].join('\n').trim()

    return { text, success: true }
  } catch (err) {
    stats.errors++
    return { text: '', success: false }
  }
}

async function extractEvents(html, sourceContext) {
  checkTokenBudget()
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content:
          `Source context: ${sourceContext}\n\n` +
          `Extract all upcoming events from the following content. ` +
          `Return a JSON array only, no preamble, no markdown. ` +
          `Each event: name, address, startDate, startTime, endDate, endTime, description, sourceUrl, recurrence, recurringDay. ` +
          `Use null for unknown fields. For recurrence use 'weekly', 'monthly', 'one-time', or null. ` +
          `For recurringDay use the day name ('Monday' through 'Sunday') or null.\n\n` +
          `Input may be a Reddit thread rather than a web page. The thread will contain a question or post ` +
          `followed by community replies. Extract every concrete event mentioned anywhere in the thread — ` +
          `post body or comments. Only extract events with at least a venue name or address AND a day or date. ` +
          `Ignore vague mentions like 'there are some bars on Wilshire.' A comment saying ` +
          `'Wednesdays at O'Brien's on Wilshire' is a valid recurring event — extract it with ` +
          `recurrence: 'weekly' and recurringDay: 'Wednesday'. Return JSON array only.\n\nContent:\n${html}`,
      }],
    })
    tokenTracker.inputTokens  += res.usage.input_tokens
    tokenTracker.outputTokens += res.usage.output_tokens

    const text = res.content[0]?.text || '[]'
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const events = JSON.parse(cleaned)
    const list = Array.isArray(events) ? events : []
    stats.eventsFound += list.length
    return { events: list }
  } catch (_) {
    // Never throws — empty array on failure
    stats.errors++
    return { events: [] }
  }
}

async function publishEvent(eventText) {
  if (DRY_RUN) {
    console.log(`  [dry-run] Would publish: ${eventText}`)
    stats.eventsPublished++
    return { success: true, eventId: `dry-run-${Date.now()}` }
  }
  try {
    const res = await fetch(`${FLYPOST_API_BASE}/api/parse-and-publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-flypost-write-token': FLYPOST_WRITE_TOKEN,
      },
      body: JSON.stringify({ text: eventText }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    if (res.ok) {
      stats.eventsPublished++
      return { success: true, eventId: data.eventId || data.id || null }
    }
    return { success: false, eventId: null }
  } catch (err) {
    stats.errors++
    return { success: false, eventId: null }
  }
}

function checkDuplicate(sourceUrl, startDate) {
  try {
    const result = dbCheckDuplicate(sourceUrl, startDate)
    if (result.isDuplicate) stats.duplicatesSkipped++
    return result
  } catch (_) {
    return { isDuplicate: false }
  }
}

function markIngested(sourceUrl, startDate, eventId, sourceName, eventName) {
  try {
    dbMarkIngested(sourceUrl, startDate, eventId, sourceName, eventName)
    return { marked: true }
  } catch (err) {
    return { marked: false, error: err.message }
  }
}

// Copied verbatim from outreach/agent.js
function logDecision(reasoning, action, result) {
  const line = `[${new Date().toISOString()}] REASONING: ${reasoning} | ACTION: ${action} | RESULT: ${result}\n`
  appendFileSync(DECISIONS_LOG, line, 'utf8')
  console.log(`  [decision] ${action}`)
  return { logged: true }
}

async function discoverSources(location) {
  checkTokenBudget()
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content:
          `You are researching local events in ${location}. ` +
          `Search broadly — city calendars, neighborhood blogs, venue websites, community organizations, ` +
          `farmers markets, bars and restaurants with weekly events, local newspapers, arts organizations, ` +
          `churches, sports leagues. Return as many specific URLs as you can find that are likely to contain ` +
          `upcoming local events. Return only a JSON array of URLs, no preamble, minimum 20.`,
      }],
    })
    tokenTracker.inputTokens  += res.usage.input_tokens
    tokenTracker.outputTokens += res.usage.output_tokens

    const text = res.content[0]?.text || '[]'
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const urls = JSON.parse(cleaned)
    return { urls: Array.isArray(urls) ? urls : [] }
  } catch (_) {
    stats.errors++
    return { urls: [] }
  }
}

function queueSource(url, location) {
  if (visitedUrls.size >= MAX_SOURCES) {
    return { queued: false, reason: `MAX_SOURCES (${MAX_SOURCES}) reached` }
  }
  if (visitedUrls.has(url)) {
    return { queued: false, reason: 'already visited' }
  }
  visitedUrls.add(url)
  pendingQueue.push({ url, location })
  return { queued: true, reason: 'added to queue' }
}

// ── TOOL DEFINITIONS (Claude API schema) ─────────────────────────────────────

const TOOLS = [
  {
    name: 'fetchPage',
    description:
      'Fetch the content of a URL. For reddit_json sources: fetches with Flypost/1.0 User-Agent, ' +
      'parses JSON, flags posts with worthFetchingThread, returns { posts: [], success }. ' +
      'For all other sources: plain fetch first, Playwright fallback for JS-rendered pages, ' +
      'truncates to 50,000 chars, returns { html, success }. Pass sourceType for Reddit sources.',
    input_schema: {
      type: 'object',
      properties: {
        url:        { type: 'string', description: 'URL to fetch' },
        sourceType: { type: 'string', description: 'Pass "reddit_json" for Reddit API endpoints' },
      },
      required: ['url'],
    },
  },
  {
    name: 'fetchRedditThread',
    description:
      'Fetch a full Reddit thread (post + all top-level comments) by post ID and subreddit. ' +
      'Strips deleted/short comments. Returns { text, success } where text is the concatenated ' +
      'readable thread content — pass this to extractEvents.',
    input_schema: {
      type: 'object',
      properties: {
        postId:    { type: 'string', description: 'Reddit post ID (the short alphanumeric id)' },
        subreddit: { type: 'string', description: 'Subreddit name without r/ prefix' },
      },
      required: ['postId', 'subreddit'],
    },
  },
  {
    name: 'extractEvents',
    description:
      'Call Claude to extract upcoming events from HTML or Reddit thread text. Returns events: ' +
      'name, address, startDate, startTime, endDate, endTime, description, sourceUrl, recurrence, recurringDay. ' +
      'recurrence: "weekly"|"monthly"|"one-time"|null. recurringDay: day name or null. ' +
      'When building the eventText for publishEvent, append recurrence info to the sentence — e.g. ' +
      '"Trivia night every Wednesday at O\'Brien\'s, 2941 Wilshire Blvd. Recurring weekly on Wednesdays." ' +
      'Never throws — returns { events: [] } on failure.',
    input_schema: {
      type: 'object',
      properties: {
        html:          { type: 'string', description: 'Raw HTML or Reddit thread text to parse' },
        sourceContext: { type: 'string', description: 'Source name and location for context' },
      },
      required: ['html', 'sourceContext'],
    },
  },
  {
    name: 'publishEvent',
    description:
      'POST a natural-language event description to Flypost. Skips (prints instead) when ' +
      '--dry-run flag is set. eventText must be a complete sentence: name, address, date, time, ' +
      'description. Returns { success, eventId }.',
    input_schema: {
      type: 'object',
      properties: {
        eventText: { type: 'string', description: 'Full natural-language event description' },
      },
      required: ['eventText'],
    },
  },
  {
    name: 'checkDuplicate',
    description: 'Check ingested_events table for a prior record matching source URL + start date. Returns { isDuplicate }.',
    input_schema: {
      type: 'object',
      properties: {
        sourceUrl: { type: 'string', description: 'Event source URL' },
        startDate: { type: 'string', description: 'Event start date (ISO 8601)' },
      },
      required: ['sourceUrl', 'startDate'],
    },
  },
  {
    name: 'markIngested',
    description: 'Write a successfully published event to the local database. Returns { marked }.',
    input_schema: {
      type: 'object',
      properties: {
        sourceUrl:  { type: 'string', description: 'Event source URL' },
        startDate:  { type: 'string', description: 'Event start date (ISO 8601)' },
        eventId:    { type: 'string', description: 'Flypost event ID from publishEvent' },
        sourceName: { type: 'string', description: 'Human-readable source name' },
        eventName:  { type: 'string', description: 'Event title' },
      },
      required: ['sourceUrl', 'startDate', 'eventId', 'sourceName', 'eventName'],
    },
  },
  {
    name: 'logDecision',
    description:
      'Append a timestamped record to decisions.log. Call whenever you choose a fallback, ' +
      'skip an event, or make a notable judgment call. Returns { logged: true }.',
    input_schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string', description: 'Why this decision was made' },
        action:    { type: 'string', description: 'What action was taken' },
        result:    { type: 'string', description: 'Outcome of the action' },
      },
      required: ['reasoning', 'action', 'result'],
    },
  },
  {
    name: 'discoverSources',
    description:
      'Ask Claude to suggest local event source URLs for a location (city calendars, venues, ' +
      'neighborhood blogs, etc.). Returns { urls: [] } — minimum 20 URLs when possible.',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Location to research (e.g. "Santa Monica, CA")' },
      },
      required: ['location'],
    },
  },
  {
    name: 'queueSource',
    description:
      'Add a URL to the processing queue if not already visited and under MAX_SOURCES cap. ' +
      'Returns { queued, reason }.',
    input_schema: {
      type: 'object',
      properties: {
        url:      { type: 'string', description: 'URL to enqueue' },
        location: { type: 'string', description: 'Location context for this source' },
      },
      required: ['url', 'location'],
    },
  },
]

// ── TOOL DISPATCHER ──────────────────────────────────────────────────────────

async function executeTool(name, input) {
  switch (name) {
    case 'fetchPage':           return await fetchPage(input.url, input.sourceType)
    case 'fetchRedditThread':   return await fetchRedditThread(input.postId, input.subreddit)
    case 'extractEvents':   return await extractEvents(input.html, input.sourceContext)
    case 'publishEvent':    return await publishEvent(input.eventText)
    case 'checkDuplicate':  return checkDuplicate(input.sourceUrl, input.startDate)
    case 'markIngested':    return markIngested(input.sourceUrl, input.startDate, input.eventId, input.sourceName, input.eventName)
    case 'logDecision':     return logDecision(input.reasoning, input.action, input.result)
    case 'discoverSources': return await discoverSources(input.location)
    case 'queueSource':     return queueSource(input.url, input.location)
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are an event ingestion agent for Flypost. Your goal is to find live local events, extract ' +
  'structured data, and publish new events to the Flypost registry. For each configured source: ' +
  'fetch the page, extract all events, check duplicates, publish new ones. After configured sources, ' +
  'call discoverSources for each active location. Process returned URLs. For each discovered page ' +
  'that contains events, use queueSource to add any links to other local event sources you find on ' +
  'that page. Continue until MAX_SOURCES is reached. Prioritize sources with recurring weekly events. ' +
  'Log every significant decision. Skip events missing address or date. Never abort on a single ' +
  'failure — log and continue. ' +
  'For reddit_json sources: call fetchPage with sourceType "reddit_json" to get the post list. ' +
  'For each post where worthFetchingThread is true, call fetchRedditThread to get the full comment ' +
  'thread. Pass the full thread text to extractEvents — the event details are often in the comments, ' +
  'not the post title. A single thread may contain multiple distinct events mentioned by different ' +
  'commenters — extract all of them.'

// ── AGENT LOOP ───────────────────────────────────────────────────────────────

async function runAgentLoop(userPrompt) {
  checkTokenBudget()
  checkTimeBudget()

  const messages = [{ role: 'user', content: userPrompt }]

  while (true) {
    checkTokenBudget()
    checkTimeBudget()

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    })

    tokenTracker.inputTokens  += res.usage.input_tokens
    tokenTracker.outputTokens += res.usage.output_tokens

    messages.push({ role: 'assistant', content: res.content })

    if (res.stop_reason === 'end_turn') break

    if (res.stop_reason === 'tool_use') {
      const toolResults = []
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue
        console.log(`  → ${block.name}(${JSON.stringify(block.input).slice(0, 120)})`)
        let result
        try {
          result = await executeTool(block.name, block.input)
        } catch (err) {
          stats.errors++
          result = { error: err.message }
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }
      messages.push({ role: 'user', content: toolResults })
    } else {
      break
    }
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  initDb()

  // Pre-seed visitedUrls so configured sources count toward the cap
  for (const source of SOURCES) {
    if (source.active) visitedUrls.add(source.url)
  }

  const activeSources = SOURCES.filter(s => s.active)
  const locations = [...new Set(activeSources.map(s => s.location))]
  const sourceList = activeSources
    .map(s => `- ${s.name}: ${s.url} (${s.location})`)
    .join('\n')

  console.log(`Flypost ingest agent starting (dry-run=${DRY_RUN}, MAX_SOURCES=${MAX_SOURCES})`)
  console.log(`Configured sources: ${activeSources.length} | Locations: ${locations.join(', ')}`)

  const userPrompt =
    `Process the following event sources and discover additional sources for their locations.\n\n` +
    `Configured sources:\n${sourceList}\n\n` +
    `Active locations: ${locations.join(', ')}\n\n` +
    `For each source: fetch the page, extract events, check for duplicates, and publish new ones. ` +
    `Then call discoverSources for each location and process those URLs. Queue any additional local ` +
    `event source links you find. Stop when MAX_SOURCES (${MAX_SOURCES}) is reached.`

  try {
    await runAgentLoop(userPrompt)
  } catch (err) {
    console.error('Fatal error:', err)
    stats.errors++
  }
}

main()
