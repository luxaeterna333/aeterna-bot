import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { activeWars, warKey } from './war-store.js';
import { buildVersusReport } from './scouting.js';
import { postSignup } from './signup.js';
import { trackWarMessage, scheduleWarDeletion } from './war-messages.js';
import { postFullStats } from './stats.js';
import { aiChat, aiEnabled } from './ai.js';
import { dynamicMapFile } from './mapgen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_LIST = 'https://vzp-gta5rp.com/api/events?limit=30&offset=0';
const API_EVENT = (id) => `https://vzp-gta5rp.com/api/events/${id}`;
const POLL_INTERVAL = 20 * 1000; // 20 секунд
const FAMILY_NAME = 'aeterna'; // подстрока для поиска нашей семьи в attacker/defender
const TG_MATCH_WINDOW_MS = 15 * 60 * 1000; // окно сопоставления ТГ-сообщения с событием API

// Карты: код -> имя файла
const mapFiles = {
  STABCITY: 'Байкерка.png',
  MIRROR_PARK: 'Миррор Парк.png',
  GHETTO_ANTS: 'Муравейник.png',
  WINDFARM: 'Ветряки.png',
  LS_CINEMA: 'Киностудия.png',
  SANDYSHORES: 'Сенди Шорс.png',
  PALETOBAY: 'Палето Бей.png',
  PB_LUMBER: 'Лесопилка.png',
  SS_CONSTRUCTION: 'Биз стройка.png',
  EL_RANCHO_SMALL_OILBASE: 'Малая нефть.png',
  PUERTA_DUMP: 'Мусорка.png',
  ELBURRO: 'Татушка.png',
  NICOLA_PLACE: 'Тупик Миррор.png',
  BANNING_ANGAR: 'Мясо.png',
};

// Находим файл карты по коду (отбрасываем префикс NEW_S_ / NEW_B_)
function findMapFile(mapCode) {
  if (!mapCode) return null;
  const clean = mapCode.replace(/^NEW_[SB]_/, '');
  const fileName = mapFiles[clean];
  if (!fileName) return null;
  const full = path.join(__dirname, fileName);
  return fs.existsSync(full) ? full : null;
}

// Размеченная карта под нашу сторону (как в канале карт): атака/защита.
// Фолбэк — базовая карта, если размеченной нет.
function annotatedMapFile(mapCode, side) {
  const ru = mapNameOf(mapCode); // "Мясо"
  const suffix = side === 'АТАКА' ? '_атака' : '_защита';
  const full = path.join(__dirname, `${ru}${suffix}.png`);
  return fs.existsSync(full) ? full : findMapFile(mapCode);
}

// Просмотренные/завершённые события персистятся на диск, чтобы перезапуск бота
// не приводил к пропуску забивов (которые случились, пока бот был выключен).
const SEEN_FILE = path.join(__dirname, 'seen-events.json');
let _store = { seen: [], finished: [] };
try { _store = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')); } catch { /* первый запуск */ }
const seenEvents = new Set(_store.seen || []);
const finishedEvents = new Set(_store.finished || []);
// Подавляем уведомления только на ПЕРВОМ поллинге и только если истории нет вообще
// (брендновый бот не спамит всей текущей лентой). При обычном перезапуске история есть → ловим пропуски.
let initialSweep = !(_store.seen && _store.seen.length);
function saveSeen() {
  try { fs.writeFileSync(SEEN_FILE, JSON.stringify({ seen: [...seenEvents].slice(-800), finished: [...finishedEvents].slice(-800) })); }
  catch (e) { console.error('[vzp] saveSeen', e.message); }
}
const ageMin = (raw) => { const d = apiInstant(raw); return d ? (Date.now() - d.getTime()) / 60000 : 9999; };

export function startVzpMonitor(client) {
  console.log('🔭 VZP-монитор (сайт) запущен');
  poll(client);
  setInterval(() => poll(client), POLL_INTERVAL);
}

async function poll(client) {
  try {
    const res = await fetch(API_LIST, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!res.ok) return console.error(`[vzp] HTTP ${res.status}`);
    const events = await res.json();
    if (!Array.isArray(events)) return;

    for (const ev of events) {
      const attacker = (ev.attackerName ?? '').toLowerCase().trim();
      const defender = (ev.defenderName ?? '').toLowerCase().trim();
      const needle = FAMILY_NAME; // 'aeterna' — ловит '.aeterna', '.Aeterna', 'Lux_Aeterna'

      const isAttacker = attacker.includes(needle);
      const isDefender = defender.includes(needle);
      if (!isAttacker && !isDefender) continue;

      const isOurs = true;
      const side = isAttacker ? 'АТАКА' : 'ДЕФ';
      const opponent = isAttacker ? ev.defenderName : ev.attackerName;

      // 1) Новое наше событие — откидываем, если оно свежее (ловит и пропущенные за время простоя)
      if (!seenEvents.has(ev.eventId)) {
        seenEvents.add(ev.eventId);
        // на самом первом запуске (нет истории) не спамим; иначе откидываем забивы не старше 30 мин
        if (!initialSweep && ageMin(ev.startedAt) <= 30) {
          await enrichOrCreate(client, ev, side, opponent);
        }
        saveSeen();
      }

      // 2) Бой завершился — шлём итог (только свежий, не старше 40 мин)
      if (ev.endedAt && !finishedEvents.has(ev.eventId)) {
        finishedEvents.add(ev.eventId);
        if (!initialSweep && ageMin(ev.endedAt) <= 40) {
          await sendResult(client, ev, side, opponent);
        }
        saveSeen();
      }
    }

    // чистка кэшей
    if (seenEvents.size > 800) {
      [...seenEvents].slice(0, 400).forEach((id) => seenEvents.delete(id));
    }
    initialSweep = false; // после первого поллинга ловим всё новое
  } catch (e) {
    console.error('[vzp] poll error:', e.message);
  }
}

// Находим ещё не привязанное ТГ-сообщение (по времени + стороне).
// Имена точек у ТГ и API не совпадают, поэтому матчим по свежести.
function findPendingTgWar(side) {
  const now = Date.now();
  let best = null;
  for (const [key, w] of activeWars) {
    if (w.source !== 'tg' || w.eventId || w.mapAdded) continue;
    if (now - (w.createdAt || 0) > TG_MATCH_WINDOW_MS) continue;
    if (w.side && side && w.side !== side) continue;
    if (!best || (w.createdAt || 0) > (best.w.createdAt || 0)) best = { key, w };
  }
  return best;
}

// Дополняем существующее ТГ-сообщение картой, либо создаём новое
async function enrichOrCreate(client, ev, side, opponent) {
  const mapFile = annotatedMapFile(ev.map, side); // размеченная карта под нашу сторону
  const match = findPendingTgWar(side);

  if (match) {
    // Дополняем картой существующее сообщение из ТГ
    try {
      const channel = await client.channels.fetch(match.w.channelId);
      const msg = await channel.messages.fetch(match.w.messageId);
      const oldEmbed = msg.embeds[0];

      const embed = EmbedBuilder.from(oldEmbed);
      const files = [];
      if (mapFile) {
        const name = path.basename(mapFile).replace(/\s/g, '_');
        const att = new AttachmentBuilder(mapFile).setName(name);
        embed.setImage(`attachment://${name}`);
        files.push(att);
      }
      embed.addFields({ name: '🗺️ Карта', value: ev.map ? mapNameOf(ev.map) : '—', inline: true });

      await msg.edit({ embeds: [embed], files });
      match.w.mapAdded = true;
      match.w.eventId = ev.eventId;
      match.w.map = ev.map;
      match.w.mapName = mapNameOf(ev.map);
      activeWars.set(match.key, match.w);
      trackWarMessage(ev.eventId, match.w.channelId, match.w.messageId);
      console.log(`[vzp] Карта добавлена к ТГ-сообщению: ${ev.pointName} (${ev.map})`);
    } catch (e) {
      console.error('[vzp] enrich error:', e.message);
    }
    announceStartAndScout(client, ev, side, opponent);
    return;
  }

  // ТГ-уведомления не было — создаём сообщение сами
  await createFromSite(client, ev, side, opponent, mapFile);
  announceStartAndScout(client, ev, side, opponent);
}

// Пинг + таймер начала + запись (основной канал), и разведка (канал разведки).
// Каждый блок независим — ошибка в одном не отменяет остальные.
async function announceStartAndScout(client, ev, side, opponent) {
  const mainId = process.env.VZP_CHANNEL_ID;
  const analyticsId = process.env.VZP_ANALYTICS_CHANNEL_ID || mainId;

  // 1) Пинг + «Начало в [забив +20 мин]»
  try {
    const channel = await client.channels.fetch(mainId);
    const guild = channel.guild;
    await guild.roles.fetch();
    const vzpRole = guild.roles.cache.find((r) => r.name.includes('| VZP'));
    const mention = vzpRole ? `<@&${vzpRole.id}>` : '';

    const start = apiInstant(ev.startedAt);
    const startPlus = start ? new Date(start.getTime() + 20 * 60 * 1000) : null;
    const timeTag = startPlus ? `<t:${Math.floor(startPlus.getTime() / 1000)}:t>` : '—';
    const tmsg = await channel.send(`${mention} ⏰ **Начало в ${timeTag}**`);
    trackWarMessage(ev.eventId, channel.id, tmsg.id);
  } catch (e) {
    console.error('[vzp] announce(таймер):', e.message);
  }

  // 2) Запись состава (лимит = формат NxN) — основной канал
  try {
    const channel = await client.channels.fetch(mainId);
    const cap = ev.maxPlayers || 0;
    const fmt = cap ? `${cap}x${cap}` : '—';
    const smsg = await postSignup(channel, cap, ev.pointName, fmt);
    trackWarMessage(ev.eventId, channel.id, smsg.id);
  } catch (e) {
    console.error('[vzp] announce(запись):', e.message);
  }

  // 3) Разведка соперника — отдельный канал (или основной, если не настроен)
  try {
    const ach = await client.channels.fetch(analyticsId);
    const embeds = await buildVersusReport(opponent, ev.map, (code) => mapNameOf(code));
    if (embeds && embeds.length) {
      const amsg = await ach.send({ content: `📊 **Разведка: ${opponent}**`, embeds });
      trackWarMessage(ev.eventId, ach.id, amsg.id);
    }
  } catch (e) {
    console.error('[vzp] announce(разведка):', e.message);
  }

  // 4) Карта под формат (если больше 5х5) — доп. позиции к базовой разметке
  try {
    const n = ev.maxPlayers || 0;
    if (n > 5) {
      const img = await dynamicMapFile(ev.map, side, n);
      if (img) {
        const channel = await client.channels.fetch(mainId);
        const name = path.basename(img);
        const msg = await channel.send({
          content: `🗺️ **Карта под формат ${n}x${n}** (${side})`,
          files: [new AttachmentBuilder(img).setName(name)],
        });
        trackWarMessage(ev.eventId, channel.id, msg.id);
      }
    }
  } catch (e) {
    console.error('[vzp] announce(карта-формат):', e.message);
  }
}

function mapNameOf(mapCode) {
  const clean = (mapCode || '').replace(/^NEW_[SB]_/, '');
  return mapFiles[clean] ? mapFiles[clean].replace('.png', '') : mapCode;
}

// API отдаёт московское время (МСК), но помечает суффиксом Z (как UTC).
// Из-за этого new Date() уходит на +3 часа. Приводим к реальному моменту.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
function apiInstant(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : new Date(t - MSK_OFFSET_MS);
}
// Динамический таймстамп Discord — сам локализуется под часовой пояс зрителя.
function discordTime(s, style = 'f') {
  const d = apiInstant(s);
  return d ? `<t:${Math.floor(d.getTime() / 1000)}:${style}>` : '—';
}

async function createFromSite(client, ev, side, opponent, mapFile) {
  try {
    const channel = await client.channels.fetch(process.env.VZP_CHANNEL_ID);

    const sideEmoji = side === 'АТАКА' ? '⚔️' : '🛡️';
    const sideColor = side === 'АТАКА' ? 0xed4245 : 0x3498db;
    const sideLabel = side === 'АТАКА' ? 'АТАКА' : 'ЗАЩИТА';
    const fmt = ev.maxPlayers ? `${ev.maxPlayers}x${ev.maxPlayers}` : '—';

    const embed = new EmbedBuilder()
      .setTitle(`${sideEmoji} ВЗП — ${sideLabel}`)
      .setColor(sideColor)
      .addFields(
        { name: '🆚 Против', value: opponent || '—', inline: true },
        { name: '🗺️ Объект', value: ev.pointName || '—', inline: true },
        { name: '🖥️ Сервер', value: ev.serverName || '—', inline: true },
        { name: '⚔️ Формат', value: fmt, inline: true },
        { name: '🗺️ Карта', value: mapNameOf(ev.map), inline: true },
      )
      .setFooter({ text: '.aeterna • VZP Monitor' })
      .setTimestamp(apiInstant(ev.startedAt) || new Date());

    const files = [];
    if (mapFile) {
      const name = path.basename(mapFile).replace(/\s/g, '_');
      const att = new AttachmentBuilder(mapFile).setName(name);
      embed.setImage(`attachment://${name}`);
      files.push(att);
    }

    const sent = await channel.send({ embeds: [embed], files });
    trackWarMessage(ev.eventId, channel.id, sent.id);

    const key = warKey(ev.pointName, ev.serverName);
    activeWars.set(key, {
      messageId: sent.id,
      channelId: channel.id,
      opponent,
      point: ev.pointName,
      server: ev.serverName,
      side,
      source: 'site',
      map: ev.map,
      mapName: mapNameOf(ev.map),
      mapAdded: true,
      eventId: ev.eventId,
    });
    console.log(`[vzp] Создано сообщение с сайта: ${side} vs ${opponent} | ${ev.pointName}`);
  } catch (e) {
    console.error('[vzp] createFromSite error:', e.message);
  }
}

// Отправка итога с детальной статистикой
async function sendResult(client, evShort, side, opponent) {
  try {
    // Тянем полные данные события
    const res = await fetch(API_EVENT(evShort.eventId), {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!res.ok) return;
    const ev = await res.json();

    // serverName берём из краткого события (в детальном оно undefined)
    const serverName = evShort.serverName || '—';

    const channel = await client.channels.fetch(process.env.VZP_CHANNEL_ID);

    const weAttacker = side === 'АТАКА';
    const weWon = ev.isAttackerWin === null
      ? null
      : weAttacker ? ev.isAttackerWin : !ev.isAttackerWin;

    const resultText = weWon === null ? '⚪ Ничья' : weWon ? '🏆 ПОБЕДА' : '💀 ПОРАЖЕНИЕ';
    const color = weWon === null ? 0x95a5a6 : weWon ? 0x2ecc71 : 0xe74c3c;

    const ourPlayers = weAttacker ? ev.attackers : ev.defenders;
    const ourStats = weAttacker ? ev.attackerStats : ev.defenderStats;

    const table = formatPlayers(ourPlayers);

    const endedRaw = evShort.endedAt || ev.endedAt;
    const endInstant = apiInstant(endedRaw);

    // Карта — из активных войн (ищем по eventId, т.к. ТГ-запись лежит под своим ключом)
    let stored = null;
    for (const w of activeWars.values()) {
      if (w.eventId === evShort.eventId) { stored = w; break; }
    }
    const mapCode = evShort.map || stored?.map || null;
    const mapName = mapCode ? mapNameOf(mapCode) : (stored?.mapName || '—');
    const serverFinal = serverName !== '—' ? serverName : (stored?.server || '—');

    const embed = new EmbedBuilder()
      .setTitle(`${resultText} — ВЗП завершён`)
      .setColor(color)
      .addFields(
        { name: '🆚 Против', value: opponent || '—', inline: true },
        { name: '🗺️ Объект', value: evShort.pointName || '—', inline: true },
        { name: '🖥️ Сервер', value: serverFinal, inline: true },
        { name: '🗺️ Карта', value: mapName, inline: true },
        { name: '📊 Итог команды', value: `Киллы: **${ourStats?.kills ?? 0}** • Урон: **${ourStats?.damage ?? 0}** • HS: **${ourStats?.headshots ?? 0}**`, inline: false },
        { name: '👥 Статистика игроков', value: table || '—', inline: false },
        { name: '🏁 Завершён', value: discordTime(endedRaw, 'f'), inline: false },
      )
      .setFooter({ text: '.aeterna • VZP Monitor' })
      .setTimestamp(endInstant || new Date());

    const rmsg = await channel.send({ embeds: [embed] });
    trackWarMessage(evShort.eventId, channel.id, rmsg.id);

    // Удалить все сообщения этой войны через 20 мин после её завершения
    const endMs = (endInstant ? endInstant.getTime() : Date.now()) + 20 * 60 * 1000;
    scheduleWarDeletion(evShort.eventId, endMs);

    // Обновляем сводную статистику в канале статистики
    postFullStats(client);

    // ИИ-разбор матча (если ИИ включён)
    if (aiEnabled()) {
      const players = (ourPlayers || []).map((p) => `${p.charName} ${p.kills}к/${p.damage}урон`).join(', ');
      const note = await aiChat([
        { role: 'system', content: 'Ты — тренер ВЗП семьи .aeterna. Кратко разбери прошедший бой: что сработало и что нет, один главный вывод. 2-4 предложения, по-русски, конкретно.' },
        { role: 'user', content: `${resultText} против ${opponent} на карте ${mapName}. Команда: киллы ${ourStats?.kills ?? 0}, урон ${ourStats?.damage ?? 0}, HS ${ourStats?.headshots ?? 0}. Игроки: ${players}.` },
      ], { maxTokens: 260, temperature: 0.5 }).catch(() => null);
      if (note) {
        const am = await channel.send({ embeds: [new EmbedBuilder().setTitle('🤖 Разбор матча').setColor(0x9b59b6).setDescription(note.slice(0, 4000)).setFooter({ text: '.aeterna • ИИ' })] });
        trackWarMessage(evShort.eventId, channel.id, am.id);
      }
    }

    console.log(`[vzp] Итог отправлен: ${resultText} vs ${opponent}`);
  } catch (e) {
    console.error('[vzp] sendResult error:', e.message);
  }
}

// Имя без семейного суффикса (Lux_Aeterna -> Lux), обрезка под узкую таблицу.
function shortName(s) {
  const n = (s || '—').trim();
  const i = n.lastIndexOf('_');
  const base = i > 0 ? n.slice(0, i) : n;
  return base.slice(0, 8);
}

// Таблица игроков (моноширинная, компактная)
function formatPlayers(players) {
  if (!players || players.length === 0) return null;
  const sorted = [...players].sort((a, b) => b.kills - a.kills || b.damage - a.damage);

  // Узкая таблица (~19 симв.) — чтобы не переносилась даже на телефонах.
  // Колонки: Игрок(8) K(2) DMG(5) HS%(4)
  const padR = (s, w) => String(s).slice(0, w).padEnd(w);
  const padL = (s, w) => String(s).padStart(w);
  const row = (n, k, d, hs) => padR(n, 8) + padL(k, 2) + padL(d, 5) + padL(hs, 4);

  const header = row('Игрок', 'K', 'DMG', 'HS');
  const sep = '─'.repeat(19);

  const lines = sorted.map((p) =>
    row(
      shortName(p.charName),
      p.kills ?? 0,
      p.damage ?? 0,
      Math.round(p.hsPercent ?? 0) + '%'
    )
  );

  const build = (rows) => '```\n' + header + '\n' + sep + '\n' + rows.join('\n') + '\n```';
  let out = build(lines);
  if (out.length > 1020) {
    const trimmed = [];
    let len = header.length + sep.length + 12;
    for (const l of lines) {
      if (len + l.length + 1 > 950) break;
      trimmed.push(l);
      len += l.length + 1;
    }
    out = build(trimmed);
  }
  return out;
}
