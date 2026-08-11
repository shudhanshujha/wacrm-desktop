const { Router } = require('express');
const store = require('../store');
const openwa = require('../openwa');

const router = Router();

router.get('/', (_req, res) => {
  res.json(store.list('broadcasts').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
});

router.get('/:id', (req, res) => {
  const b = store.getItem('broadcasts', req.params.id);
  if (!b) return res.status(404).json({ error: 'not found' });
  res.json(b);
});

router.post('/', async (req, res) => {
  const { sessionId, name, message, mediaUrl, targets = [] } = req.body || {};
  if (!sessionId || (!message && !mediaUrl)) return res.status(400).json({ error: 'sessionId and message or mediaUrl are required' });
  if (!targets.length) return res.status(400).json({ error: 'no targets' });

  const broadcast = store.createItem('broadcasts', {
    sessionId,
    name: name || message?.slice(0, 40) || 'Broadcast',
    message: message || '',
    mediaUrl: mediaUrl || null,
    targets,
    status: 'pending',
    results: {},
    startedAt: null,
    completedAt: null,
  });

  try {
    const isMedia = Boolean(mediaUrl);
    const batch = await openwa.post(`/sessions/${sessionId}/messages/send-bulk`, {
      messages: targets.map((t) => ({
        chatId: t.chatId || t,
        type: isMedia ? 'image' : 'text',
        content: isMedia
          ? { url: mediaUrl, caption: message || undefined }
          : { text: message },
      })),
      options: { delayBetweenMessages: 3000, randomizeDelay: true },
    });
    const batchId = batch?.batchId || batch?.batch?.batchId || null;
    store.updateItem('broadcasts', broadcast.id, { status: 'running', batchId, startedAt: new Date().toISOString() });
    res.status(201).json(store.getItem('broadcasts', broadcast.id));
  } catch (err) {
    store.updateItem('broadcasts', broadcast.id, { status: 'failed', error: err.message });
    res.status(err.statusCode || 502).json({ error: err.message, detail: err.body });
  }
});

router.post('/:id/poll', async (req, res) => {
  const b = store.getItem('broadcasts', req.params.id);
  if (!b) return res.status(404).json({ error: 'not found' });
  if (!b.batchId) return res.json(b);

  try {
    const status = await openwa.get(`/sessions/${b.sessionId}/messages/batch/${b.batchId}`);
    const results = status?.results || status?.batch?.results || {};
    const counts = { total: b.targets.length, sent: 0, failed: 0 };
    for (const v of Object.values(results)) {
      if (v?.status === 'sent' || v?.status === 'delivered' || v?.status === 'read') counts.sent += 1;
      else if (v?.status === 'failed' || v?.error) counts.failed += 1;
    }
    const complete = counts.sent + counts.failed >= counts.total;
    store.updateItem('broadcasts', b.id, {
      results,
      ...(complete
        ? { status: 'completed', completedAt: new Date().toISOString() }
        : { status: 'running' }),
    });
    res.json({ ...store.getItem('broadcasts', b.id), counts });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message });
  }
});

module.exports = router;
