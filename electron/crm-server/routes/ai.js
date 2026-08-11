const { Router } = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const store = require('../store');

const router = Router();

function resolveApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const f = path.join(store.DATA_DIR, 'ai-key');
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  } catch {
    /* ignore */
  }
  return null;
}

router.post('/key', (req, res) => {
  const { key } = req.body || {};
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key required' });
  const file = path.join(store.DATA_DIR, 'ai-key');
  fs.mkdirSync(store.DATA_DIR, { recursive: true });
  fs.writeFileSync(file, key.trim(), 'utf8');
  res.json({ ok: true });
});

function callAnthropic(system, userPrompt) {
  return new Promise((resolve, reject) => {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      return reject(Object.assign(new Error('Anthropic API key not set. Add it in Settings → AI assistant.'), { code: 502 }));
    }
    const payload = JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const req = https.request(
      {
        host: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-length': Buffer.byteLength(payload),
        },
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            json = { error: { message: raw } };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const text = (json.content || [])
              .filter((b) => b.type === 'text')
              .map((b) => b.text)
              .join('\n')
              .trim();
            resolve(text);
          } else {
            const err = new Error(json.error?.message || `Anthropic error ${res.statusCode}`);
            err.statusCode = res.statusCode;
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Anthropic request timed out')));
    req.write(payload);
    req.end();
  });
}

router.post('/suggest', async (req, res) => {
  const { contactName, history = [], tone = 'professional' } = req.body || {};
  const transcript = (Array.isArray(history) ? history : [])
    .slice(-12)
    .map((m) => `${m.fromMe ? 'Agent' : 'Customer'}: ${m.body || ''}`)
    .join('\n');

  const system = [
    'You are a customer support AI assistant embedded in a WhatsApp CRM.',
    `Tone: ${tone}. Write natural, concise WhatsApp-style replies (1-3 sentences).`,
    'Reply with ONLY the message text. No quotes, no prefixes, no emoji unless natural.',
  ].join('\n');

  const user = contactName
    ? `Customer: ${contactName}\n\nRecent conversation:\n${transcript || '(no history yet)'}\n\nWrite the next agent reply:`
    : `Recent conversation:\n${transcript || '(no history yet)'}\n\nWrite the next agent reply:`;

  try {
    const text = await callAnthropic(system, user);
    res.json({ text });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message });
  }
});

module.exports = router;
