import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { updateDraft } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadCredentials() {
  const credPath = resolve(__dirname, process.env.GMAIL_CREDENTIALS_PATH);
  const tokenPath = resolve(__dirname, process.env.GMAIL_TOKEN_PATH);

  const credentials = JSON.parse(readFileSync(credPath, 'utf8'));
  const token = JSON.parse(readFileSync(tokenPath, 'utf8'));

  const { client_secret, client_id, redirect_uris } = credentials.installed ?? credentials.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  auth.setCredentials(token);

  return auth;
}

function buildRawMessage({ to, subject, body }) {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function saveGmailDraft({ redfin_url, email, subject, body }) {
  const auth = loadCredentials();
  const gmail = google.gmail({ version: 'v1', auth });

  const raw = buildRawMessage({ to: email, subject, body });

  await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: { raw },
    },
  });

  updateDraft(redfin_url);
  console.log(`  [gmail] Draft saved for ${email} — "${subject}"`);
}
