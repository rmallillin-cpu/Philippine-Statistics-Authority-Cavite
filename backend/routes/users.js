const express = require('express');
const multer = require('multer');
const sheetsService = require('../services/sheetsService');
const driveService = require('../services/driveService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function publicUser(u) {
  const { PasswordHash, ...rest } = u;
  return rest;
}

// GET /api/users/me - own profile
router.get('/me', requireAuth, async (req, res) => {
  const user = await sheetsService.getById('Users', req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user));
});

// PUT /api/users/me - edit own profile (name, position shown read-only in UI, profile picture)
router.put('/me', requireAuth, upload.single('profilePic'), async (req, res) => {
  try {
    const updates = {};
    ['FirstName', 'MiddleName', 'LastName'].forEach((f) => {
      if (req.body[f]) updates[f] = req.body[f];
    });

    if (req.file) {
      const { viewUrl } = await driveService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
      updates.ProfilePicUrl = viewUrl;
    }

    const updated = await sheetsService.update('Users', req.user.id, updates);
    res.json(publicUser(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update profile', detail: err.message });
  }
});

// GET /api/users - admin: list all users
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const users = await sheetsService.getAll('Users');
  res.json(users.map(publicUser));
});

// PUT /api/users/:id - admin: edit any user (position, department, role, date retired/resigned, etc.)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowed = ['FirstName', 'MiddleName', 'LastName', 'Position', 'Department', 'Role', 'DateHired', 'DateRetiredResigned'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const updated = await sheetsService.update('Users', req.params.id, updates);
    res.json(publicUser(updated));
  } catch (err) {
    res.status(500).json({ error: 'Could not update user', detail: err.message });
  }
});

// DELETE /api/users/:id - admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const ok = await sheetsService.remove('Users', req.params.id);
  if (!ok) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'User deleted' });
});

module.exports = router;
