import { getPendingDrafts } from './db.js';

function buildDraft(row) {
  const { agent_name, address, dom } = row;
  const firstName = agent_name?.split(' ')[0] ?? 'there';
  const addr = address ?? 'your listing';
  const days = dom ?? '14+';

  const subject = `Why are buyers walking away from ${addr}?`;

  const body = `Hi ${firstName},

${addr} has been on for 67 days. Buyers are walking through and not telling you why they're leaving.
  Flypost captures anonymous buyer feedback at open houses — honest reactions they won't share to your face but will leave in a ballot box.

  We just ran our first deployment with a Compass agent in West LA.

  Worth a conversation?

  Bronco @ Flypost;

  return { subject, body };
}

export async function generateDrafts() {
  const rows = getPendingDrafts();
  console.log(`[draftEmail] ${rows.length} listings need draft emails`);

  const drafts = [];

  for (const row of rows) {
    console.log(`  [draftEmail] Building email for ${row.agent_name} <${row.agent_email}>...`);
    const { subject, body } = buildDraft(row);
    drafts.push({
      redfin_url: row.redfin_url,
      agentName: row.agent_name,
      email: row.agent_email,
      subject,
      body,
    });
  }

  return drafts;
}
