// Трекинг сообщений по eventId войны и удаление через 20 мин после её завершения.
// Персистится в JSON, чтобы переживать перезапуск бота.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, 'war-messages.json');
const SAFETY_MS = 3 * 60 * 60 * 1000; // подстраховка: удалить, если конец так и не пришёл

let data = {};
try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { data = {}; }
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(data)); } catch (e) { console.error('[warmsg] save', e.message); }
}

export function trackWarMessage(eventId, channelId, messageId) {
  if (!eventId || !channelId || !messageId) return;
  const r = data[eventId] || (data[eventId] = { msgs: [], deleteAt: null, createdAt: Date.now() });
  if (!r.msgs.some((x) => x.m === messageId)) r.msgs.push({ c: channelId, m: messageId });
  save();
}

// deleteAt — абсолютная метка времени (мс). Обычно конец ВЗП + 20 мин.
export function scheduleWarDeletion(eventId, deleteAt) {
  if (!eventId) return;
  const r = data[eventId] || (data[eventId] = { msgs: [], deleteAt: null, createdAt: Date.now() });
  r.deleteAt = deleteAt;
  save();
}

const BACKSTOP_MS = 2 * 60 * 60 * 1000; // подстраховка для НЕотслеженных сообщений бота

export function startWarMessageSweep(client, backstopChannels = []) {
  const sweep = async () => {
    const now = Date.now();
    let changed = false;

    // 1) Точное удаление отслеженных войн (конец + 20 мин), либо страховка 3ч
    for (const [eid, r] of Object.entries(data)) {
      const due = (r.deleteAt && now >= r.deleteAt) || (now - (r.createdAt || now) > SAFETY_MS);
      if (!due) continue;
      for (const { c, m } of r.msgs) {
        try {
          const ch = await client.channels.fetch(c);
          const msg = await ch.messages.fetch(m);
          await msg.delete().catch(() => {});
        } catch { /* сообщение/канал уже недоступны */ }
      }
      delete data[eid];
      changed = true;
    }
    if (changed) save();

    // 2) Подстраховка: чистим свои сообщения старше 2ч в каналах ВЗП/разведки
    //    (ловит нетреканные/тестовые/пропущенные). Канал карт сюда НЕ входит.
    for (const id of backstopChannels) {
      if (!id) continue;
      try {
        const ch = await client.channels.fetch(id);
        const msgs = await ch.messages.fetch({ limit: 100 });
        for (const m of msgs.values()) {
          if (m.author?.id === client.user.id && now - m.createdTimestamp > BACKSTOP_MS) {
            await m.delete().catch(() => {});
          }
        }
      } catch { /* канал недоступен */ }
    }
  };
  sweep();
  setInterval(sweep, 60 * 1000);
  console.log('🧹 Удаление сообщений ВЗП: конец+20мин (трек) + подстраховка 2ч');
}
