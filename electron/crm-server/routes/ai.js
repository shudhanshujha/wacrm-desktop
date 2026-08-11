const { Router } = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const store = require('../store');

const router = Router();

function loadAiConfig() {
  const configFile = path.join(store.DATA_DIR, 'ai-config.json');
  let config = {
    provider: process.env.AI_PROVIDER || 'groq',
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
  };

  try {
    if (fs.existsSync(configFile)) {
      const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      config = { ...config, ...saved };
    } else {
      // Legacy fallback check for single ai-key file
      const legacyKeyFile = path.join(store.DATA_DIR, 'ai-key');
      if (fs.existsSync(legacyKeyFile)) {
        const legacyKey = fs.readFileSync(legacyKeyFile, 'utf8').trim();
        if (legacyKey.startsWith('gsk_')) {
          config.provider = 'groq';
          config.groqApiKey = legacyKey;
        } else {
          config.provider = 'anthropic';
          config.anthropicApiKey = legacyKey;
        }
      }
    }
  } catch {
    /* ignore */
  }

  return config;
}

function saveAiConfig(newConfig) {
  const configFile = path.join(store.DATA_DIR, 'ai-config.json');
  fs.mkdirSync(store.DATA_DIR, { recursive: true });
  const current = loadAiConfig();
  const updated = { ...current, ...newConfig };
  fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

router.get('/config', (_req, res) => {
  const config = loadAiConfig();
  res.json({
    provider: config.provider,
    groqApiKey: config.groqApiKey ? '••••••••' + config.groqApiKey.slice(-4) : '',
    hasGroqKey: Boolean(config.groqApiKey),
    groqModel: config.groqModel,
    anthropicApiKey: config.anthropicApiKey ? '••••••••' + config.anthropicApiKey.slice(-4) : '',
    hasAnthropicKey: Boolean(config.anthropicApiKey),
    anthropicModel: config.anthropicModel,
  });
});

router.post('/config', (req, res) => {
  const { provider, groqApiKey, groqModel, anthropicApiKey, anthropicModel } = req.body || {};
  const current = loadAiConfig();

  const toSave = {
    provider: provider || current.provider,
    groqModel: groqModel || current.groqModel,
    anthropicModel: anthropicModel || current.anthropicModel,
  };

  if (groqApiKey !== undefined && !groqApiKey.includes('••••')) {
    toSave.groqApiKey = groqApiKey.trim();
  }
  if (anthropicApiKey !== undefined && !anthropicApiKey.includes('••••')) {
    toSave.anthropicApiKey = anthropicApiKey.trim();
  }

  const updated = saveAiConfig(toSave);
  res.json({ ok: true, provider: updated.provider });
});

router.post('/key', (req, res) => {
  const { key, provider } = req.body || {};
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key required' });
  const k = key.trim();
  const prov = provider || (k.startsWith('gsk_') ? 'groq' : 'anthropic');
  if (prov === 'groq') {
    saveAiConfig({ provider: 'groq', groqApiKey: k });
  } else {
    saveAiConfig({ provider: 'anthropic', anthropicApiKey: k });
  }
  res.json({ ok: true });
});

function callGroq(system, userPrompt, apiKey, model) {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      return reject(
        Object.assign(new Error('Groq API key not set. Add it in Settings → AI assistant.'), { code: 502 }),
      );
    }
    const payload = JSON.stringify({
      model: model || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const req = https.request(
      {
        host: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
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
            const text = (json.choices?.[0]?.message?.content || '').trim();
            resolve(text);
          } else {
            const err = new Error(json.error?.message || `Groq error ${res.statusCode}`);
            err.statusCode = res.statusCode;
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Groq request timed out')));
    req.write(payload);
    req.end();
  });
}

function callAnthropic(system, userPrompt, apiKey, model) {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      return reject(
        Object.assign(new Error('Anthropic API key not set. Add it in Settings → AI assistant.'), { code: 502 }),
      );
    }
    const payload = JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
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

  const config = loadAiConfig();

  try {
    let text = '';
    if (config.provider === 'groq') {
      text = await callGroq(system, user, config.groqApiKey, config.groqModel);
    } else {
      text = await callAnthropic(system, user, config.anthropicApiKey, config.anthropicModel);
    }
    res.json({ text });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message });
  }
});

module.exports = router;
