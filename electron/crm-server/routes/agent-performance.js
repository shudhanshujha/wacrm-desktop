const { Router } = require('express');
const store = require('../store');

const router = Router();

function build() {
  const events = store.list('agent_activity');
  const convs = store.read('conversations', {});
  const agents = {};
  const ensure = (id) => {
    if (!id) return null;
    if (!agents[id]) {
      agents[id] = {
        agentId: id,
        handled: 0,
        resolved: 0,
        manualReplies: 0,
        autoReplies: 0,
        avgResolutionMs: null,
        events: [],
      };
    }
    return agents[id];
  };

  const assigned = new Set();
  const resolvedAt = new Map();
  const firstAssign = new Map();

  for (const conv of Object.values(convs)) {
    if (conv.assignedTo) {
      ensure(conv.assignedTo);
      assigned.add(conv.chatId);
      if (!firstAssign.has(conv.chatId)) firstAssign.set(conv.chatId, conv.createdAt);
    }
    if (conv.status === 'resolved' && conv.resolvedAt) {
      resolvedAt.set(conv.chatId, conv.resolvedAt);
    }
  }

  for (const ev of events) {
    const agent = ensure(ev.agentId);
    if (!agent) continue;
    agent.events.push(ev);
    if (ev.type === 'resolved') agent.resolved += 1;
    if (ev.type === 'message_sent_manual') agent.manualReplies += 1;
    if (ev.type === 'message_sent_auto') agent.autoReplies += 1;
  }

  for (const chatId of firstAssign.keys()) {
    const agentId = convs[chatId]?.assignedTo;
    if (!agentId) continue;
    ensure(agentId);
    agents[agentId].handled += 1;
    const start = new Date(firstAssign.get(chatId)).getTime();
    const end = resolvedAt.has(chatId) ? new Date(resolvedAt.get(chatId)).getTime() : Date.now();
    const dur = end - start;
    if (!agents[agentId].avgResolutionMs) agents[agentId].avgResolutionMs = dur;
    else agents[agentId].avgResolutionMs = (agents[agentId].avgResolutionMs + dur) / 2;
  }

  const rows = Object.values(agents).map((a) => ({
    agentId: a.agentId,
    handled: a.handled,
    resolved: a.resolved,
    manualReplies: a.manualReplies,
    autoReplies: a.autoReplies,
    responseRate: a.handled ? Math.round((a.manualReplies / a.handled) * 100) : 0,
    avgResolutionHours: a.avgResolutionMs ? +(a.avgResolutionMs / 3600000).toFixed(2) : null,
  }));
  return rows.sort((a, b) => b.handled - a.handled);
}

router.get('/', (_req, res) => {
  res.json(build());
});

module.exports = router;
