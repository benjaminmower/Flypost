import Anthropic from '@anthropic-ai/sdk';
import { getPendingDrafts } from './db.js';

const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are a skilled real estate marketing consultant helping a property technology startup reach out to listing agents whose properties have been on the market for 30+ days in Santa Monica, CA.

Your tone is professional, warm, and empathetic — never pushy. You understand that a stale listing is stressful for both the agent and seller. Keep emails concise (under 200 words), scannable, and focused on a single clear value proposition.

Flypost is a platform that connects sellers with local buyers through hyper-targeted digital outreach — think social and email campaigns aimed at people actively searching in specific Santa Monica neighborhoods. It's performance-based, so agents pay only when it drives measurable engagement.`;

function buildUserPrompt(listing) {
  const { agent_name, address, dom, list_price, brokerage } = listing;
  const firstName = agent_name?.split(' ')[0] ?? 'there';

  return `Write a cold outreach email to a listing agent whose property has been sitting on the market.

Agent details:
- Name: ${agent_name ?? 'Unknown'}
- Brokerage: ${brokerage ?? 'Unknown'}

Listing details:
- Address: ${address ?? 'a Santa Monica property'}
- Days on market: ${dom ?? '30+'} days
- List price: ${list_price ?? 'not listed'}

Instructions:
- Address the agent by first name (${firstName})
- Acknowledge the listing has been on the market for a while — show empathy, not judgment
- Introduce Flypost as a tool that generates fresh, targeted buyer interest for Santa Monica listings
- Mention it's performance-based with no upfront cost
- End with a soft CTA: offer a quick 15-minute call to explain how it works
- Do NOT use generic filler phrases like "I hope this email finds you well"
- Sign the email as "Alex" from "Flypost"

Format your response as:
Line 1: Subject line (no "Subject:" prefix)
Blank line
Remaining lines: Email body`;
}

export async function generateDrafts() {
  const client = new Anthropic();
  const rows = getPendingDrafts();
  console.log(`[draftEmail] ${rows.length} listings need draft emails`);

  const drafts = [];

  for (const row of rows) {
    console.log(`  [draftEmail] Generating email for ${row.agent_name} <${row.agent_email}>...`);

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(row) }],
      });

      const text = message.content[0]?.text ?? '';
      const lines = text.split('\n');
      const subject = lines[0].trim();
      const body = lines.slice(2).join('\n').trim(); // skip subject + blank line

      drafts.push({
        redfin_url: row.redfin_url,
        agentName: row.agent_name,
        email: row.agent_email,
        subject,
        body,
      });
    } catch (err) {
      console.error(`  [draftEmail] Error for ${row.agent_name}: ${err.message}`);
    }
  }

  return drafts;
}
