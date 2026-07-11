const express = require('express');
const sheetsService = require('../services/sheetsService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/accomplishments/me - own accomplishments, newest first
router.get('/me', requireAuth, async (req, res) => {
  const all = await sheetsService.getAll('Accomplishments');
  const mine = all
    .filter((a) => a.UserID === String(req.user.id))
    .sort((a, b) => new Date(b.Date) - new Date(a.Date));
  res.json(mine);
});

// POST /api/accomplishments - create own entry
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, date } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Title and date are required' });
    const record = await sheetsService.insert('Accomplishments', {
      UserID: req.user.id,
      Title: title,
      Description: description || '',
      Date: date,
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Could not save accomplishment', detail: err.message });
  }
});

// PUT /api/accomplishments/:id - edit own entry (or admin)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await sheetsService.getById('Accomplishments', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.UserID !== String(req.user.id) && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not your entry' });
    }
    const { title, description, date } = req.body;
    const updates = {};
    if (title !== undefined) updates.Title = title;
    if (description !== undefined) updates.Description = description;
    if (date !== undefined) updates.Date = date;
    const updated = await sheetsService.update('Accomplishments', req.params.id, updates);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update accomplishment', detail: err.message });
  }
});

// DELETE /api/accomplishments/:id - own entry (or admin)
router.delete('/:id', requireAuth, async (req, res) => {
  const existing = await sheetsService.getById('Accomplishments', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.UserID !== String(req.user.id) && req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Not your entry' });
  }
  await sheetsService.remove('Accomplishments', req.params.id);
  res.json({ message: 'Deleted' });
});

// GET /api/accomplishments - admin: everyone's entries, joined with name/department, for the report
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const [all, users] = await Promise.all([
    sheetsService.getAll('Accomplishments'),
    sheetsService.getAll('Users'),
  ]);
  const byId = Object.fromEntries(users.map((u) => [u.ID, u]));
  const enriched = all
    .map((a) => {
      const u = byId[a.UserID] || {};
      return {
        ...a,
        userName: u.FirstName ? `${u.FirstName} ${u.LastName}` : 'Unknown',
        department: u.Department || '—',
        position: u.Position || '—',
      };
    })
    .sort((a, b) => new Date(b.Date) - new Date(a.Date));
  res.json(enriched);
});

module.exports = router;
