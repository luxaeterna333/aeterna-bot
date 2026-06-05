// Хранилище записей на ВЗП (по id сообщения). Персистится в JSON,
// чтобы перезапуск бота не сбрасывал состав.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, 'signups.json');

let data = {};
try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { data = {}; }

function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(data)); } catch (e) { console.error('[signup] save', e.message); }
}

export function initSignup(msgId, cap, point, fmt) {
  if (!data[msgId]) data[msgId] = { cap, point, fmt, list: [], caller: null };
  else data[msgId].cap = cap;
  save();
  return data[msgId];
}

// Тоггл: нет в списке -> добавить, есть -> убрать. Возвращает состояние.
export function toggleSignup(msgId, cap, userId) {
  const s = data[msgId] || (data[msgId] = { cap, point: '', fmt: '', list: [], caller: null });
  s.cap = cap;
  const i = s.list.indexOf(userId);
  if (i >= 0) { s.list.splice(i, 1); if (s.caller === userId) s.caller = null; }
  else s.list.push(userId);
  save();
  return s;
}

// Тоггл коллера. Коллер также входит в состав.
export function toggleCaller(msgId, cap, userId) {
  const s = data[msgId] || (data[msgId] = { cap, point: '', fmt: '', list: [], caller: null });
  s.cap = cap;
  s.caller = (s.caller === userId) ? null : userId;
  if (s.caller && !s.list.includes(userId)) s.list.push(userId);
  save();
  return s;
}

export function getSignup(msgId) {
  return data[msgId] || null;
}
