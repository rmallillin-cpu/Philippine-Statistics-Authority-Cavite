const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

/**
 * Two ways to provide credentials:
 * 1. GOOGLE_SERVICE_ACCOUNT_JSON env var containing the *entire* key file's JSON as a string
 *    (this is what you use on Render — paste the file's contents into an env var, never commit it).
 * 2. GOOGLE_SERVICE_ACCOUNT_KEY_FILE pointing to a local file (handy for local dev only).
 */
function buildAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  }
  const keyFile = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './service-account.json');
  return new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
}

const auth = buildAuth();

async function getSheetsClient() {
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function getDriveClient() {
  const client = await auth.getClient();
  return google.drive({ version: 'v3', auth: client });
}

module.exports = { getSheetsClient, getDriveClient };
