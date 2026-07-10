const { getDriveClient } = require('../config/googleAuth');
const { Readable } = require('stream');
require('dotenv').config();

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

/**
 * Uploads a file buffer to the PSA Drive folder, makes it viewable by anyone with the link,
 * and returns { fileId, viewUrl, downloadUrl }.
 */
async function uploadFile(buffer, filename, mimeType, subfolderId = null) {
  const drive = await getDriveClient();

  const fileMetadata = {
    name: `${Date.now()}_${filename}`,
    parents: [subfolderId || FOLDER_ID],
  };
  const media = { mimeType, body: Readable.from(buffer) };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id',
  });

  const fileId = file.data.id;

  // Make it viewable by anyone with the link (adjust if your PSA Drive policy requires domain-only sharing)
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    fileId,
    viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}

/** Creates a named subfolder inside the main PSA Drive folder (e.g. one per user) and returns its ID. */
async function createSubfolder(name, parentId = FOLDER_ID) {
  const drive = await getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return res.data.id;
}

module.exports = { uploadFile, createSubfolder };
