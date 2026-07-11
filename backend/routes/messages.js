const express = require('express');
const sheetsService = require('../services/sheetsService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function publicDirectoryUser(u) {
  return {
    id: u.ID,
    name: `${u.FirstName} ${u.LastName}`,
    department: u.Department || '',
    position: u.Position || '',
    profilePicUrl: u.ProfilePicUrl || '',
  };
}

// GET /api/messages/directory - everyone you can message (active users, excluding yourself)
router.get('/directory', requireAuth, async (req, res) => {
  const users = await sheetsService.getAll('Users');
  const list = users
    .filter((u) => u.ID !== String(req.user.id) && !u.DateRetiredResigned)
    .map(publicDirectoryUser);
  res.json(list);
});

// GET /api/messages/conversations - one row per person you've messaged with, most recent first
router.get('/conversations', requireAuth, async (req, res) => {
  const [messages, users] = await Promise.all([
    sheetsService.getAll('Messages'),
    sheetsService.getAll('Users'),
  ]);
  const byId = Object.fromEntries(users.map((u) => [u.ID, u]));
  const myId = String(req.user.id);
  const mine = messages.filter((m) => m.FromID === myId || m.ToID === myId);

  const byPartner = {};
  for (const m of mine) {
    const partnerId = m.FromID === myId ? m.ToID : m.FromID;
    if (!byPartner[partnerId] || new Date(m.CreatedAt) > new Date(byPartner[partnerId].lastMessage.CreatedAt)) {
      byPartner[partnerId] = { partnerId, lastMessage: m, unread: 0 };
    }
  }
  for (const m of mine) {
    const partnerId = m.FromID === myId ? m.ToID : m.FromID;
    if (m.ToID === myId && String(m.Read) !== 'true') {
      byPartner[partnerId].unread += 1;
    }
  }

  const conversations = Object.values(byPartner)
    .map((c) => {
      const u = byId[c.partnerId];
      return {
        partner: u ? publicDirectoryUser(u) : { id: c.partnerId, name: 'Unknown', department: '', position: '', profilePicUrl: '' },
        lastMessage: c.lastMessage.Content,
        lastMessageAt: c.lastMessage.CreatedAt,
        lastMessageMine: c.lastMessage.FromID === myId,
        unread: c.unread,
      };
    })
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

  res.json(conversations);
});

// GET /api/messages/unread-count - badge count across all conversations
router.get('/unread-count', requireAuth, async (req, res) => {
  const messages = await sheetsService.getAll('Messages');
  const myId = String(req.user.id);
  const count = messages.filter((m) => m.ToID === myId && String(m.Read) !== 'true').length;
  res.json({ count });
});

// GET /api/messages/thread/:userId - full history with one person; marks their messages to you as read
router.get('/thread/:userId', requireAuth, async (req, res) => {
  const myId = String(req.user.id);
  const otherId = req.params.userId;
  const messages = await sheetsService.getAll('Messages');
  const thread = messages
    .filter((m) => (m.FromID === myId && m.ToID === otherId) || (m.FromID === otherId && m.ToID === myId))
    .sort((a, b) => new Date(a.CreatedAt) - new Date(b.CreatedAt));

  const unreadFromThem = thread.filter((m) => m.FromID === otherId && m.ToID === myId && String(m.Read) !== 'true');
  await Promise.all(unreadFromThem.map((m) => sheetsService.update('Messages', m.ID, { Read: 'true' })));

  res.json(thread.map((m) => ({ ...m, mine: m.FromID === myId })));
});

// POST /api/messages - send a message
router.post('/', requireAuth, async (req, res) => {
  try {
    const { toId, content } = req.body;
    if (!toId || !content || !content.trim()) {
      return res.status(400).json({ error: 'Recipient and message content are required' });
    }
    const record = await sheetsService.insert('Messages', {
      FromID: req.user.id,
      ToID: toId,
      Content: content.trim(),
      Read: 'false',
    });
    res.json({ ...record, mine: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not send message', detail: err.message });
  }
});

module.exports = router;
