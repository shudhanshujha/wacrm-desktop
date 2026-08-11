const { Router } = require('express');
const store = require('../store');
const openwa = require('../openwa');

const router = Router();
const NAME = 'automations';

router.get('/', (_req, res) => {
  res.json(store.list(NAME).sort((a, b) => a.name.localeCompare(b.name)));
});

router.post('/', (req, res) => {
  const { name, trigger, steps } = req.body || {};
  if (!name || !trigger || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'name, trigger and steps required' });
  }
  res.status(201).json(
    store.createItem(NAME, {
      name,
      enabled: true,
      trigger,
      steps,
      runCount: 0,
    }),
  );
});

router.put('/:id', (req, res) => {
  const { name, trigger, steps, enabled } = req.body || {};
  const item = store.updateItem(NAME, req.params.id, { name, trigger, steps, enabled });
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

router.delete('/:id', (req, res) => {
  store.deleteItem(NAME, req.params.id);
  res.json({ ok: true });
});

async function runFlow(automation, sessionId, chatId, inboundBody) {
  const steps = automation.steps || [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step.type === 'send') {
      const text = interpolate(step.message, { inboundBody, chatId });
      await openwa.post(`/sessions/${sessionId}/messages/send-text`, { chatId, text });
      logOutbound(sessionId, chatId, text, 'auto');
    } else if (step.type === 'handover') {
      const conv = store.read('conversations', {});
      conv[chatId] = {
        ...(conv[chatId] || {}),
        chatId,
        botPaused: true,
        status: 'handover',
        handoverAt: new Date().toISOString(),
        handoverAgent: step.assignTo || null,
      };
      store.write('conversations', conv);
    } else if (step.type === 'wait') {
      await sleep(Number(step.minutes || 1) * 60 * 1000);
    }
  }
  store.updateItem(NAME, automation.id, { runCount: (automation.runCount || 0) + 1 });
}

function interpolate(text, vars) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function logOutbound(sessionId, chatId, text, kind) {
  const events = store.list('agent_activity');
  events.push({
    id: store.id('act'),
    sessionId,
    chatId,
    type: kind === 'auto' ? 'message_sent_auto' : 'message_sent_manual',
    createdAt: new Date().toISOString(),
  });
  store.write('agent_activity', events);
}

async function trigger(webhookData) {
  const { sessionId, chatId, body } = webhookData || {};
  if (!sessionId || !chatId || !body) return;
  const automations = store.list(NAME).filter((a) => a.enabled);
  const conv = store.read('conversations', {})[chatId] || {};
  if (conv.botPaused) return;

  for (const a of automations) {
    if (matches(a.trigger, body)) {
      try {
        await runFlow(a, sessionId, chatId, body);
      } catch (err) {
        console.error('[automation] flow failed:', a.name, err.message);
      }
    }
  }
}

function matches(trigger, body) {
  if (!trigger) return false;
  const text = String(body || '').toLowerCase();
  const value = String(trigger.value || '').toLowerCase();
  switch (trigger.type) {
    case 'keyword':
      return text.includes(value);
    case 'exact':
      return text === value;
    case 'regex':
      try {
        return new RegExp(trigger.value, 'i').test(body || '');
      } catch {
        return false;
      }
    default:
      return false;
  }
}

module.exports = router;
module.exports.trigger = trigger;
