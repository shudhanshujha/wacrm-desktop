const { Router } = require('express');
const store = require('../store');
const openwa = require('../openwa');

const router = Router();

router.get('/contacts/:chatId/timeline', async (req, res) => {
  const chatId = req.params.chatId;
  const items = [];
  try {
    const history = await openwa.get(`/sessions/${req.query.sessionId}/messages/${encodeURIComponent(chatId)}/history?limit=30`);
    if (Array.isArray(history)) {
      for (const m of history) {
        items.push({
          type: 'message',
          direction: m.fromMe ? 'out' : 'in',
          body: m.body || '',
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
        });
      }
    }
  } catch {
    /* history may not be available; fall back to stored broadcast records */
  }

  const broadcasts = store.list('broadcasts');
  for (const b of broadcasts) {
    const rec = (b.results || {})[chatId];
    if (rec) {
      items.push({
        type: 'broadcast',
        direction: 'out',
        body: b.message,
        timestamp: b.createdAt,
        status: rec.status,
      });
    }
  }

  items.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  res.json({ chatId, items: items.slice(-60) });
});

module.exports = router;
