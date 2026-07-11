const express = require('express');
const sheetsService = require('../services/sheetsService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function normalizeAssignedTo(assignedTo) {
  if (!assignedTo || assignedTo === 'all') return 'all';
  const ids = Array.isArray(assignedTo) ? assignedTo : String(assignedTo).split(',');
  return ids.map((s) => String(s).trim()).filter(Boolean).join(',');
}

function enrich(entry, usersById, myId) {
  let assignedNames = 'Everyone';
  let ids = [];
  if (entry.AssignedTo && entry.AssignedTo !== 'all') {
    ids = entry.AssignedTo.split(',').filter(Boolean);
    assignedNames = ids
      .map((id) => (usersById[id] ? `${usersById[id].FirstName} ${usersById[id].LastName}` : 'Unknown'))
      .join(', ') || 'Nobody';
  }
  const isMine = entry.AssignedTo === 'all' || ids.includes(myId);
  return { ...entry, assignedNames, isMine };
}

// GET /api/schedule - everyone: the full shared schedule, soonest first
router.get('/', requireAuth, async (req, res) => {
  const [entries, users] = await Promise.all([
    sheetsService.getAll('Schedule'),
    sheetsService.getAll('Users'),
  ]);
  const usersById = Object.fromEntries(users.map((u) => [u.ID, u]));
  const myId = String(req.user.id);
  const enriched = entries
    .map((e) => enrich(e, usersById, myId))
    .sort((a, b) => new Date(`${a.Date}T${a.TimeStart || '00:00'}`) - new Date(`${b.Date}T${b.TimeStart || '00:00'}`));
  res.json(enriched);
});

// POST /api/schedule - admin only
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, date, timeStart, timeEnd, assignedTo } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Title and date are required' });
    const record = await sheetsService.insert('Schedule', {
      Title: title,
      AssignedTo: normalizeAssignedTo(assignedTo),
      Date: date,
      TimeStart: timeStart || '',
      TimeEnd: timeEnd || '',
      CreatedBy: req.user.id,
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Could not create schedule entry', detail: err.message });
  }
});

// PUT /api/schedule/:id - admin only
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, date, timeStart, timeEnd, assignedTo } = req.body;
    const updates = {};
    if (title !== undefined) updates.Title = title;
    if (date !== undefined) updates.Date = date;
    if (timeStart !== undefined) updates.TimeStart = timeStart;
    if (timeEnd !== undefined) updates.TimeEnd = timeEnd;
    if (assignedTo !== undefined) updates.AssignedTo = normalizeAssignedTo(assignedTo);
    const updated = await sheetsService.update('Schedule', req.params.id, updates);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update schedule entry', detail: err.message });
  }
});

// DELETE /api/schedule/:id - admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  await sheetsService.remove('Schedule', req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
