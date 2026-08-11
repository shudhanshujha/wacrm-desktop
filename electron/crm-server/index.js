const express = require('express');
const path = require('path');
const openwa = require('./openwa');

const PORT = parseInt(process.env.CRM_PORT || '3100', 10);

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use('/api/core', require('./routes/proxy'));
app.use('/api/canned-replies', require('./routes/canned-replies'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/agent-performance', require('./routes/agent-performance'));
app.use('/api/timeline', require('./routes/timeline'));
app.use('/api/broadcasts', require('./routes/broadcasts'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/webhook', require('./routes/webhook'));

app.get('/api/status', async (_req, res) => {
  const coreAlive = await openwa.checkAlive();
  let sessions = [];
  if (coreAlive) {
    try {
      sessions = await openwa.get('/sessions');
    } catch {
      sessions = [];
    }
  }
  res.json({ coreAlive, sessions });
});

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: 'frontend not built yet' });
  });
});

app.use((err, _req, res, _next) => {
  console.error('[crm-server]', err.message);
  res.status(err.statusCode || 500).json({ error: err.message });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[crm-server] listening on http://127.0.0.1:${PORT}`);
});

module.exports = app;
