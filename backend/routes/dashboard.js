const express = require('express');
const sheetsService = require('../services/sheetsService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/stats - admin summary cards
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  const [users, departments, positions, logs] = await Promise.all([
    sheetsService.getAll('Users'),
    sheetsService.getAll('Departments'),
    sheetsService.getAll('Positions'),
    sheetsService.getAll('Logs'),
  ]);

  const activeUsers = users.filter((u) => !u.DateRetiredResigned);
  const today = new Date().toISOString().slice(0, 10);
  const timeInsToday = logs.filter((l) => l.Action === 'TimeIn' && l.Timestamp.startsWith(today));

  const byDepartment = {};
  activeUsers.forEach((u) => {
    byDepartment[u.Department || 'Unassigned'] = (byDepartment[u.Department || 'Unassigned'] || 0) + 1;
  });

  res.json({
    totalActiveUsers: activeUsers.length,
    totalRetiredResigned: users.length - activeUsers.length,
    totalDepartments: departments.length,
    totalPositions: positions.length,
    signedInToday: new Set(timeInsToday.map((l) => l.UserID)).size,
    byDepartment,
  });
});

// GET /api/dashboard/logs - admin: full attendance / activity log, newest first
router.get('/logs', requireAuth, requireAdmin, async (req, res) => {
  const [logs, users] = await Promise.all([sheetsService.getAll('Logs'), sheetsService.getAll('Users')]);
  const nameById = Object.fromEntries(users.map((u) => [u.ID, `${u.FirstName} ${u.LastName}`]));
  const parsedMs = (ts) => {
    const ms = Date.parse(ts);
    return Number.isNaN(ms) ? 0 : ms; // unparseable timestamps sink to the bottom instead of scrambling the sort
  };
  const enriched = logs
    .map((l) => ({ ...l, userName: nameById[l.UserID] || 'Unknown' }))
    .sort((a, b) => parsedMs(b.Timestamp) - parsedMs(a.Timestamp));
  res.json(enriched);
});

module.exports = router;
