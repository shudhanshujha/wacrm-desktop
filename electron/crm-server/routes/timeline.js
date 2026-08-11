const { Router } = require('express');
const store = require('../store');
const openwa = require('../openwa');

const router = Router();

const getTimelineHandler = async (req, res) => {
  const chatId = req.params.chatId;
  const items = [];
  const sessionId = req.query.sessionId;
  if (sessionId) {
    try {
      const history = await openwa.get(`/sessions/${sessionId}/messages?chatId=${encodeURIComponent(chatId)}&limit=30`);
      const list = Array.isArray(history) ? history : Array.isArray(history?.messages) ? history.messages : [];
      for (const m of list) {
        items.push({
          type: 'message',
          direction: m.fromMe ? 'out' : 'in',
          body: m.body || m.caption || m.text || '',
          timestamp: m.timestamp ? (String(m.timestamp).length <= 10 ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date(Number(m.timestamp)).toISOString()) : null,
        });
      }
    } catch {
      /* history fallback */
    }
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
};

router.get('/contacts/:chatId/timeline', getTimelineHandler);
router.get('/contacts/:chatId', getTimelineHandler);

module.exports = router;
