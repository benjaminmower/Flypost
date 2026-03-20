import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createInterface } from 'readline';
import { updateDraft } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadCredentials() {
  const credPath = resolve(__dirname, process.env.GMAIL_CREDENTIALS_PATH);
  const tokenPath = resolve(__dirname, process.env.GMAIL_TOKEN_PATH);

  const credentials = JSON.parse(readFileSync(credPath, 'utf8'));
  const token = JSON.parse(readFileSync(tokenPath, 'utf8'));

  const { client_secret, client_id } = credentials.installed ?? credentials.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob');
  auth.setCredentials(token);

  return auth;
}

export async function ensureAuth() {
  const tokenPath = resolve(__dirname, process.env.GMAIL_TOKEN_PATH);

  if (existsSync(tokenPath)) {
    return loadCredentials();
  }

  const credPath = resolve(__dirname, process.env.GMAIL_CREDENTIALS_PATH);
  const credentials = JSON.parse(readFileSync(credPath, 'utf8'));
  const { client_secret, client_id } = credentials.installed ?? credentials.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob');

  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.compose'],
  });

  console.log('Open this URL in your browser and authorize access:');
  console.log(authUrl);

  const code = await new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Paste the authorization code here: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const { tokens } = await auth.getToken(code);
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log(`Token saved to ${tokenPath}`);
  auth.setCredentials(tokens);

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
  const auth = await ensureAuth();
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
