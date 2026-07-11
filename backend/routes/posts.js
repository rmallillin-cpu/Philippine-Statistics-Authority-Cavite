const express = require('express');
const multer = require('multer');
const sheetsService = require('../services/sheetsService');
const driveService = require('../services/driveService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// GET /api/posts - everyone: announcement feed, newest first
router.get('/', requireAuth, async (req, res) => {
  const [posts, users] = await Promise.all([
    sheetsService.getAll('Posts'),
    sheetsService.getAll('Users'),
  ]);
  const byId = Object.fromEntries(users.map((u) => [u.ID, u]));
  const enriched = posts
    .map((p) => {
      const u = byId[p.AuthorID] || {};
      return {
        ...p,
        authorName: u.FirstName ? `${u.FirstName} ${u.LastName}` : 'PSA Cavite',
        authorProfilePic: u.ProfilePicUrl || '',
      };
    })
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  res.json(enriched);
});

// POST /api/posts - admin only: publish an announcement, optional image to Drive
router.post('/', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Announcement content is required' });

    let imageUrl = '';
    if (req.file) {
      const { viewUrl } = await driveService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
      imageUrl = viewUrl;
    }

    const record = await sheetsService.insert('Posts', {
      AuthorID: req.user.id,
      Content: content.trim(),
      ImageUrl: imageUrl,
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Could not publish announcement', detail: err.message });
  }
});

// DELETE /api/posts/:id - admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  await sheetsService.remove('Posts', req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
