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

// POST /api/posts - any signed-in user can publish an announcement, optional image or video to Drive
// Only admins can mark a post "Featured" (sitewide sidebar), even if the flag is sent by a non-admin.
router.post('/', requireAuth, upload.single('media'), async (req, res) => {
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

    const isFeaturedRequested = featured === 'true' || featured === true;
    const record = await sheetsService.insert('Posts', {
      AuthorID: req.user.id,
      Content: content.trim(),
      ImageUrl: mediaUrl,
      MediaType: mediaType,
      Featured: isFeaturedRequested && req.user.role === 'Admin' ? 'true' : '',
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Could not publish announcement', detail: err.message });
  }
});

// PUT /api/posts/:id - the post's author, or an admin, can edit the text content
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await sheetsService.getById('Posts', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.AuthorID !== String(req.user.id) && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only the post author (or an admin) can edit this' });
    }
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Announcement content is required' });
    const updated = await sheetsService.update('Posts', req.params.id, { Content: content.trim() });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update announcement', detail: err.message });
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

// DELETE /api/posts/:id - the post's author, or an admin
router.delete('/:id', requireAuth, async (req, res) => {
  const existing = await sheetsService.getById('Posts', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.AuthorID !== String(req.user.id) && req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only the post author (or an admin) can delete this' });
  }
  await sheetsService.remove('Posts', req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
