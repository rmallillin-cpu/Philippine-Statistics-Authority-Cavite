const express = require('express');
const sheetsService = require('../services/sheetsService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/** Builds GET/POST/PUT/DELETE routes for a simple {ID, Name} lookup tab (Departments, Positions). */
function buildLookupRouter(tabName) {
  const r = express.Router();

  r.get('/', requireAuth, async (req, res) => {
    res.json(await sheetsService.getAll(tabName));
  });

  r.post('/', requireAuth, requireAdmin, async (req, res) => {
    if (!req.body.Name) return res.status(400).json({ error: 'Name is required' });
    res.json(await sheetsService.insert(tabName, { Name: req.body.Name }));
  });

  r.put('/:id', requireAuth, requireAdmin, async (req, res) => {
    res.json(await sheetsService.update(tabName, req.params.id, { Name: req.body.Name }));
  });

  r.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    const ok = await sheetsService.remove(tabName, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  });

  return r;
}

router.use('/departments', buildLookupRouter('Departments'));
router.use('/positions', buildLookupRouter('Positions'));

// Public, no-auth versions (name + id only) so the registration screen can populate its dropdowns
router.get('/departments-public', async (req, res) => {
  res.json(await sheetsService.getAll('Departments'));
});
router.get('/positions-public', async (req, res) => {
  res.json(await sheetsService.getAll('Positions'));
});

module.exports = router;
