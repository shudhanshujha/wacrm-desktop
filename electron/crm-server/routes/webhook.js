const { Router } = require('express');
const store = require('../store');
const automations = require('./automations');

const router = Router();

router.post('/', async (req, res) => {
  const body = req.body || {};
  const event = body.event || body.type || null;
  const sessionId = body.sessionId || null;
  const message = body.message || body.data?.message || body.data || null;
  const chatId = message?.chatId || message?.remoteJid || message?.from || null;
  const fromMe = !!(message?.fromMe || message?.from_me || message?.from === 'me');
  const text = message?.body || message?.text || message?.conversation || '';

  res.status(200).json({ ok: true });

  if (!chatId) return;

  const convs = store.read('conversations', {});
  const prev = convs[chatId] || {
    chatId,
    status: 'open',
    botPaused: false,
    assignedTo: null,
    unread: 0,
    createdAt: new Date().toISOString(),
  };

  if (event === 'message.received' || (event && event.includes('message') && !fromMe && text)) {
    convs[chatId] = {
      ...prev,
      chatId,
      lastMessage: text,
      lastMessageAt: new Date().toISOString(),
      unread: fromMe ? prev.unread : (prev.unread || 0) + 1,
    };
    store.write('conversations', convs);
    automations.trigger({ sessionId, chatId, body: text });
  } else if (event === 'message.sent' || (event && event.includes('message') && fromMe)) {
    const events = store.list('agent_activity');
    events.push({
      id: store.id('act'),
      sessionId,
      chatId,
      type: 'message_sent_manual',
      createdAt: new Date().toISOString(),
    });
    store.write('agent_activity', events);
    convs[chatId] = {
      ...prev,
      chatId,
      lastMessage: text,
      lastMessageAt: new Date().toISOString(),
      unread: 0,
    };
    store.write('conversations', convs);
  }
});

module.exports = router;
