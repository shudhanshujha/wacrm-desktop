const { Router } = require('express');
const store = require('../store');

const router = Router();
const CONV = 'conversations';
const ACTIVITY = 'agent_activity';

function upsertConversation(chatId, patch) {
  const all = store.read(CONV, {});
  const prev = all[chatId] || {
    chatId,
    status: 'open',
    botPaused: false,
    assignedTo: null,
    unread: 0,
    createdAt: new Date().toISOString(),
  };
  const next = { ...prev, ...patch, chatId, updatedAt: new Date().toISOString() };
  all[chatId] = next;
  store.write(CONV, all);
  return next;
}

function logActivity(entry) {
  const events = store.list(ACTIVITY);
  events.push({ ...entry, id: store.id('act'), createdAt: new Date().toISOString() });
  store.write(ACTIVITY, events);
}

router.get('/', (_req, res) => {
  res.json(store.read(CONV, {}));
});

router.get('/:chatId', (req, res) => {
  const all = store.read(CONV, {});
  res.json(all[req.params.chatId] || null);
});

router.post('/:chatId/mark-read', (req, res) => {
  const conv = upsertConversation(req.params.chatId, { unread: 0 });
  res.json(conv);
});

router.post('/:chatId/handover', (req, res) => {
  const { assignedTo, message, note } = req.body || {};
  const conv = upsertConversation(req.params.chatId, {
    botPaused: true,
    status: 'handover',
    assignedTo: assignedTo || null,
    handoverNote: note || null,
    handoverMessage: message || null,
    handoverAt: new Date().toISOString(),
  });
  if (assignedTo) {
    logActivity({ chatId: conv.chatId, type: 'assigned', agentId: assignedTo });
  }
  logActivity({ chatId: conv.chatId, type: 'handover', agentId: assignedTo || 'system' });
  res.json(conv);
});

router.post('/:chatId/resume', (req, res) => {
  const conv = upsertConversation(req.params.chatId, {
    botPaused: false,
    status: 'open',
    handoverAt: null,
  });
  logActivity({ chatId: conv.chatId, type: 'resume', agentId: 'system' });
  res.json(conv);
});

router.post('/:chatId/assign', (req, res) => {
  const { agentId } = req.body || {};
  const conv = upsertConversation(req.params.chatId, { assignedTo: agentId || null });
  if (agentId) logActivity({ chatId: conv.chatId, type: 'assigned', agentId });
  res.json(conv);
});

router.post('/:chatId/resolve', (req, res) => {
  const conv = upsertConversation(req.params.chatId, {
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
  });
  logActivity({ chatId: conv.chatId, type: 'resolved', agentId: conv.assignedTo || 'system' });
  res.json(conv);
});

router.post('/:chatId/note', (req, res) => {
  const { note } = req.body || {};
  if (!note) return res.status(400).json({ error: 'note required' });
  const conv = upsertConversation(req.params.chatId, {
    notes: [...(store.read(CONV, {})[req.params.chatId]?.notes || []), note],
  });
  res.json(conv);
});

module.exports = router;
