const express = require('express');
const multer = require('multer');
const sheetsService = require('../services/sheetsService');
const driveService = require('../services/driveService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
// 50MB cap to allow short video clips, not just images.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

// POST /api/posts - admin only: publish an announcement, optional image or video to Drive
router.post('/', requireAuth, requireAdmin, upload.single('media'), async (req, res) => {
  try {
    const { content, featured } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Announcement content is required' });

    let mediaUrl = '';
    let mediaType = '';
    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/');
      mediaType = isVideo ? 'video' : 'image';
      // Videos need the iframe-playable preview URL; images use the lighter thumbnail URL.
      const { embedUrl, previewUrl } = await driveService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
      mediaUrl = isVideo ? previewUrl : embedUrl;
    }

    const record = await sheetsService.insert('Posts', {
      AuthorID: req.user.id,
      Content: content.trim(),
      ImageUrl: mediaUrl,
      MediaType: mediaType,
      Featured: featured === 'true' || featured === true ? 'true' : '',
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Could not publish announcement', detail: err.message });
  }
});

// PUT /api/posts/:id/featured - admin only: pin/unpin a post to the sitewide sidebar
router.put('/:id/featured', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { featured } = req.body;
    const updated = await sheetsService.update('Posts', req.params.id, { Featured: featured ? 'true' : '' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update announcement', detail: err.message });
  }
});

// DELETE /api/posts/:id - admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  await sheetsService.remove('Posts', req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
