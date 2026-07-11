const express = require('express');
const sheetsService = require('../services/sheetsService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/comments - everyone: all comments across all posts, oldest first (grouped client-side by PostID)
router.get('/', requireAuth, async (req, res) => {
  const [comments, users] = await Promise.all([
    sheetsService.getAll('Comments'),
    sheetsService.getAll('Users'),
  ]);
  const byId = Object.fromEntries(users.map((u) => [u.ID, u]));
  const enriched = comments
    .map((c) => {
      const u = byId[c.AuthorID] || {};
      return {
        ...c,
        authorName: u.FirstName ? `${u.FirstName} ${u.LastName}` : 'Unknown',
        authorProfilePic: u.ProfilePicUrl || '',
      };
    })
    .sort((a, b) => new Date(a.CreatedAt) - new Date(b.CreatedAt));
  res.json(enriched);
});

// POST /api/comments - any signed-in user can comment on an announcement
router.post('/', requireAuth, async (req, res) => {
  try {
    const { postId, content } = req.body;
    if (!postId || !content || !content.trim()) {
      return res.status(400).json({ error: 'A comment needs a post and some text' });
    }
    const record = await sheetsService.insert('Comments', {
      PostID: postId,
      AuthorID: req.user.id,
      Content: content.trim(),
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Could not post comment', detail: err.message });
  }
});

// DELETE /api/comments/:id - the comment's author, or an admin
router.delete('/:id', requireAuth, async (req, res) => {
  const existing = await sheetsService.getById('Comments', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.AuthorID !== String(req.user.id) && req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only the comment author (or an admin) can delete this' });
  }
  await sheetsService.remove('Comments', req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
