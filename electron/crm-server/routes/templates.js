const { Router } = require('express');
const store = require('../store');

const router = Router();
const NAME = 'templates';

router.get('/', (_req, res) => {
  res.json(store.list(NAME).sort((a, b) => a.name.localeCompare(b.name)));
});

router.post('/', (req, res) => {
  const { name, body } = req.body || {};
  if (!name || !body) return res.status(400).json({ error: 'name and body required' });
  res.status(201).json(store.createItem(NAME, { name, body }));
});

router.put('/:id', (req, res) => {
  const { name, body } = req.body || {};
  const item = store.updateItem(NAME, req.params.id, { name, body });
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

router.delete('/:id', (req, res) => {
  store.deleteItem(NAME, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
