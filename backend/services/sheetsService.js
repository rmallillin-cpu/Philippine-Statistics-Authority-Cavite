const bcrypt = require('bcryptjs');
const { getSheetsClient } = require('../config/googleAuth');
require('dotenv').config();

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Default Admin account, auto-created on first run if the Users tab is empty.
// Override with env vars if you want different defaults; change the password after first login either way.
const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@12345';

// Tab layouts. Column A is always "ID".
const SCHEMAS = {
  Users: ['ID', 'FirstName', 'MiddleName', 'LastName', 'Position', 'Department', 'Username',
    'PasswordHash', 'ProfilePicUrl', 'DateHired', 'DateRetiredResigned', 'Role', 'CreatedAt'],
  Departments: ['ID', 'Name'],
  Positions: ['ID', 'Name'],
  Logs: ['ID', 'UserID', 'Action', 'Timestamp'],
  Accomplishments: ['ID', 'UserID', 'Title', 'Description', 'Date', 'CreatedAt'],
  Files: ['ID', 'UploaderID', 'AssigneeID', 'FileName', 'FileUrl', 'Status', 'Comment', 'CreatedAt', 'UpdatedAt'],
  Posts: ['ID', 'AuthorID', 'Content', 'ImageUrl', 'CreatedAt', 'MediaType', 'Featured'],
  Messages: ['ID', 'FromID', 'ToID', 'Content', 'CreatedAt', 'Read'],
  Schedule: ['ID', 'Title', 'AssignedTo', 'Date', 'TimeStart', 'TimeEnd', 'CreatedBy', 'CreatedAt'],
  Comments: ['ID', 'PostID', 'AuthorID', 'Content', 'CreatedAt', 'ParentCommentID'],
};

/** Ensures every schema tab exists with the correct header row. Run once at startup. */
async function ensureTabsExist() {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingTitles = meta.data.sheets.map((s) => s.properties.title);

  for (const [tabName, headers] of Object.entries(SCHEMAS)) {
    if (!existingTitles.includes(tabName)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
      console.log(`Created tab: ${tabName}`);
    }
  }
}

function rowsToObjects(headers, rows) {
  return rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

/** Reads all rows of a tab as an array of objects keyed by header. */
async function getAll(tabName) {
  const sheets = await getSheetsClient();
  const headers = SCHEMAS[tabName];
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A2:${String.fromCharCode(64 + headers.length)}`,
  });
  return rowsToObjects(headers, res.data.values || []);
}

async function getById(tabName, id) {
  const all = await getAll(tabName);
  return all.find((r) => r.ID === String(id)) || null;
}

/** Appends a new row. Auto-generates ID and CreatedAt if the schema has those columns. */
async function insert(tabName, data) {
  const sheets = await getSheetsClient();
  const headers = SCHEMAS[tabName];
  const id = data.ID || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const record = { ...data, ID: id };
  if (headers.includes('CreatedAt') && !record.CreatedAt) {
    record.CreatedAt = new Date().toISOString();
  }
  if (headers.includes('Timestamp') && !record.Timestamp) {
    record.Timestamp = new Date().toISOString();
  }
  const row = headers.map((h) => (record[h] !== undefined ? record[h] : ''));
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return record;
}

/** Finds the 1-based sheet row number for a given ID (row 1 is headers, so data starts at row 2). */
async function findRowIndex(tabName, id) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A2:A`,
  });
  const ids = (res.data.values || []).map((r) => r[0]);
  const idx = ids.indexOf(String(id));
  return idx === -1 ? -1 : idx + 2; // +2 because data starts at row 2
}

async function update(tabName, id, updates) {
  const sheets = await getSheetsClient();
  const headers = SCHEMAS[tabName];
  const rowNum = await findRowIndex(tabName, id);
  if (rowNum === -1) throw new Error(`${tabName} record ${id} not found`);

  const existing = await getById(tabName, id);
  const merged = { ...existing, ...updates, ID: id };
  const row = headers.map((h) => (merged[h] !== undefined ? merged[h] : ''));
  const lastCol = String.fromCharCode(64 + headers.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A${rowNum}:${lastCol}${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
  return merged;
}

async function remove(tabName, id) {
  const sheets = await getSheetsClient();
  const rowNum = await findRowIndex(tabName, id);
  if (rowNum === -1) return false;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetProps = meta.data.sheets.find((s) => s.properties.title === tabName).properties;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetProps.sheetId,
            dimension: 'ROWS',
            startIndex: rowNum - 1,
            endIndex: rowNum,
          },
        },
      }],
    },
  });
  return true;
}

/**
 * Creates a default Admin account if the Users tab is completely empty (e.g. brand-new
 * deployment). Safe to call every startup — it only ever acts once, the very first time.
 * Returns true if it created the account, false if users already exist.
 */
async function ensureDefaultAdmin() {
  const users = await getAll('Users');
  if (users.length > 0) return false;

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  await insert('Users', {
    FirstName: 'System',
    MiddleName: '',
    LastName: 'Administrator',
    Position: 'Administrator',
    Department: 'Office of the Administrator',
    Username: DEFAULT_ADMIN_USERNAME,
    PasswordHash: passwordHash,
    ProfilePicUrl: '',
    DateHired: new Date().toISOString().slice(0, 10),
    DateRetiredResigned: '',
    Role: 'Admin',
  });

  console.log('================================================================');
  console.log('  No users found — created a default Admin account:');
  console.log(`    Username: ${DEFAULT_ADMIN_USERNAME}`);
  console.log(`    Password: ${DEFAULT_ADMIN_PASSWORD}`);
  console.log('  Sign in with these, then change the password immediately from');
  console.log('  My Profile > Change Password.');
  console.log('================================================================');
  return true;
}

module.exports = { SCHEMAS, ensureTabsExist, ensureDefaultAdmin, getAll, getById, insert, update, remove };
