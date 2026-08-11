const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.WACRM_DATA_DIR || path.join(__dirname, '..', '..', 'data');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function read(name, fallback) {
  ensureDir();
  const file = fileFor(name);
  if (!fs.existsSync(file)) return fallback;
  try {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.trim()) return fallback;
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function write(name, data) {
  ensureDir();
  const targetFile = fileFor(name);
  const tmpFile = `${targetFile}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, targetFile);
  } catch (err) {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      /* ignore unlink errors */
    }
    // Fallback direct write if rename fails across partitions
    fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), 'utf8');
  }
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function list(name) {
  return read(name, []);
}

function getItem(name, itemId) {
  return list(name).find((i) => i.id === itemId) || null;
}

function createItem(name, data) {
  const items = list(name);
  const item = { ...data, id: id(name === 'automations' ? 'flow' : name), createdAt: new Date().toISOString() };
  items.push(item);
  write(name, items);
  return item;
}

function updateItem(name, itemId, patch) {
  const items = list(name);
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() };
  write(name, items);
  return items[idx];
}

function deleteItem(name, itemId) {
  const items = list(name).filter((i) => i.id !== itemId);
  write(name, items);
  return true;
}

module.exports = {
  DATA_DIR,
  list,
  read,
  write,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  id,
};
