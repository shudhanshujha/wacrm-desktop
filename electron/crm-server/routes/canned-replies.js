const { Router } = require('express');
const store = require('../store');

const router = Router();
const NAME = 'canned_replies';

router.get('/', (_req, res) => {
  res.json(store.list(NAME).sort((a, b) => a.title.localeCompare(b.title)));
});

router.post('/', (req, res) => {
  const { title, shortcut, body } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }
  const item = store.createItem(NAME, {
    title,
    shortcut: shortcut || title,
    body,
  });
  res.status(201).json(item);
});

router.put('/:id', (req, res) => {
  const { title, shortcut, body } = req.body || {};
  const item = store.updateItem(NAME, req.params.id, { title, shortcut, body });
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

router.delete('/:id', (req, res) => {
  store.deleteItem(NAME, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
