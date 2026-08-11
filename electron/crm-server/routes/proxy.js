const { Router } = require('express');
const openwa = require('../openwa');

const router = Router();

router.all('*', async (req, res) => {
  try {
    const rel = req.originalUrl.replace(/^\/api\/core/, '');
    const method = req.method;
    const body = ['POST', 'PUT', 'PATCH'].includes(method) ? req.body : undefined;
    const qs = new URLSearchParams(req.query).toString();
    const path = `${rel}${qs ? `?${qs}` : ''}`;
    const result = await openwa.request(method, path, body);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message, detail: err.body });
  }
});

module.exports = router;
