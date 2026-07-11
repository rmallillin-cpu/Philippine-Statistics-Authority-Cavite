const express = require('express');
const multer = require('multer');
const sheetsService = require('../services/sheetsService');
const driveService = require('../services/driveService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const STATUSES = ['Pending', 'In Progress', 'Needs Revision', 'Approved'];

function enrich(f, usersById) {
  const uploader = usersById[f.UploaderID];
  const assignee = usersById[f.AssigneeID];
  return {
    ...f,
    uploaderName: uploader ? `${uploader.FirstName} ${uploader.LastName}` : 'Unknown',
    assigneeName: assignee ? `${assignee.FirstName} ${assignee.LastName}` : 'Unknown',
  };
}

// GET /api/files/mine - files I submitted, newest first
router.get('/mine', requireAuth, async (req, res) => {
  const [files, users] = await Promise.all([sheetsService.getAll('Files'), sheetsService.getAll('Users')]);
  const usersById = Object.fromEntries(users.map((u) => [u.ID, u]));
  const mine = files
    .filter((f) => f.UploaderID === String(req.user.id))
    .map((f) => enrich(f, usersById))
    .sort((a, b) => new Date(b.UpdatedAt || b.CreatedAt) - new Date(a.UpdatedAt || a.CreatedAt));
  res.json(mine);
});

// GET /api/files/assigned - files sent to me for approval/review, newest first
router.get('/assigned', requireAuth, async (req, res) => {
  const [files, users] = await Promise.all([sheetsService.getAll('Files'), sheetsService.getAll('Users')]);
  const usersById = Object.fromEntries(users.map((u) => [u.ID, u]));
  const assigned = files
    .filter((f) => f.AssigneeID === String(req.user.id))
    .map((f) => enrich(f, usersById))
    .sort((a, b) => new Date(b.UpdatedAt || b.CreatedAt) - new Date(a.UpdatedAt || a.CreatedAt));
  res.json(assigned);
});

// POST /api/files - submit a file to someone for approval
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { assigneeId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'A file is required' });
    if (!assigneeId) return res.status(400).json({ error: 'Choose who this is for' });

    const { viewUrl } = await driveService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    const now = new Date().toISOString();
    const record = await sheetsService.insert('Files', {
      UploaderID: req.user.id,
      AssigneeID: assigneeId,
      FileName: req.file.originalname,
      FileUrl: viewUrl,
      Status: 'Pending',
      Comment: '',
      UpdatedAt: now,
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Could not submit file', detail: err.message });
  }
});

// PUT /api/files/:id/status - the assignee (reviewer), or an admin, moves it through the workflow
router.put('/:id/status', requireAuth, async (req, res) => {
  try {
    const existing = await sheetsService.getById('Files', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.AssigneeID !== String(req.user.id) && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only the assigned reviewer (or an admin) can update this' });
    }
    const { status, comment } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const updated = await sheetsService.update('Files', req.params.id, {
      Status: status,
      Comment: comment || '',
      UpdatedAt: new Date().toISOString(),
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update status', detail: err.message });
  }
});

// PUT /api/files/:id/resubmit - the uploader sends a revised file back after "Needs Revision"
router.put('/:id/resubmit', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const existing = await sheetsService.getById('Files', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.UploaderID !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the original uploader can resubmit this' });
    }
    if (!req.file) return res.status(400).json({ error: 'A revised file is required' });

    const { viewUrl } = await driveService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    const updated = await sheetsService.update('Files', req.params.id, {
      FileName: req.file.originalname,
      FileUrl: viewUrl,
      Status: 'Pending',
      Comment: '',
      UpdatedAt: new Date().toISOString(),
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not resubmit file', detail: err.message });
  }
});

// DELETE /api/files/:id - the uploader, or an admin
router.delete('/:id', requireAuth, async (req, res) => {
  const existing = await sheetsService.getById('Files', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.UploaderID !== String(req.user.id) && req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only the uploader (or an admin) can delete this' });
  }
  await sheetsService.remove('Files', req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
