// Аналитика по сопернику для уведомления о забиве.
// Источник — публичный API vzp-gta5rp.com. Доступные поля игрока:
// charName, kills, shots, damage, hitPercent, hsPercent (времени жизни/смертей в API НЕТ).
import { EmbedBuilder } from 'discord.js';

const H = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
const API_LIST = (l, o) => `https://vzp-gta5rp.com/api/events?limit=${l}&offset=${o}`;
export const API_EVENT = (id) => `https://vzp-gta5rp.com/api/events/${id}`;

export const norm = (s) => (s || '').toLowerCase().trim();
export const isUs = (s) => norm(s).includes('aeterna');
const mapClean = (m) => (m || '').replace(/^NEW_[SB]_/, '');

export async function getJson(url) {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// Имя без семейного суффикса (Lux_Aeterna -> Lux), обрезка под узкую таблицу.
export function shortName(s) {
  const n = (s || '—').trim();
  const i = n.lastIndexOf('_');
  const base = i > 0 ? n.slice(0, i) : n;
  return base.slice(0, 7);
}

// Результат матча для НАШЕЙ семьи: true (победа) / false (поражение) / null.
export function ourResult(e) {
  if (e.winnerName) return isUs(e.winnerName);
  if (e.isAttackerWin === true || e.isAttackerWin === false) {
    return isUs(e.attackerName) ? e.isAttackerWin : !e.isAttackerWin;
  }
  return null;
}

export async function scanEvents(maxScan = 600) {
  const evs = [];
  for (let off = 0; off < maxScan; off += 50) {
    let list;
    try { list = await getJson(API_LIST(50, off)); } catch { break; }
    if (!Array.isArray(list) || list.length === 0) break;
    evs.push(...list);
    if (list.length < 50) break;
  }
  return evs;
}

export function accRoster(map, roster) {
  for (const p of roster || []) {
    const a = map.get(p.charName) || { games: 0, kills: 0, damage: 0 };
    a.games += 1;
    a.kills += p.kills || 0;
    a.damage += p.damage || 0;
    map.set(p.charName, a);
  }
}

function topByDmg(map, n) {
  return [...map.entries()]
    .map(([name, a]) => ({ name: shortName(name), games: a.games, avgK: a.kills / a.games, avgDmg: Math.round(a.damage / a.games) }))
    .sort((x, y) => y.avgDmg - x.avgDmg)
    .slice(0, n);
}

// Узкая таблица (~19 симв.): Игрок Игр К Урон
function playerTable(rows) {
  if (!rows.length) return '—';
  const padR = (s, w) => String(s).slice(0, w).padEnd(w);
  const padL = (s, w) => String(s).padStart(w);
  const line = (n, g, k, d) => padR(n, 7) + padL(g, 3) + padL(k, 4) + padL(d, 5);
  const out = [line('Игрок', 'Игр', 'К', 'Урон'), '─'.repeat(19),
    ...rows.map((r) => line(r.name, r.games, r.avgK.toFixed(1), r.avgDmg))];
  return '```\n' + out.join('\n') + '\n```';
}

// Таблица состава: Игрок %
function lineupTable(rows) {
  if (!rows.length) return '—';
  const padR = (s, w) => String(s).slice(0, w).padEnd(w);
  const padL = (s, w) => String(s).padStart(w);
  const out = [padR('Игрок', 11) + padL('%', 5), '─'.repeat(16),
    ...rows.map((r) => padR(r.name, 11) + padL(r.pct + '%', 5))];
  return '```\n' + out.join('\n') + '\n```';
}

// Сбор сырых данных по сопернику (для эмбедов и для ИИ). Возвращает объект или null.
export async function gatherVersusData(opponent, mapCode) {
  let all;
  try { all = await scanEvents(600); } catch { return null; }
  if (!all.length) return null;

  const target = norm(opponent);
  const finished = all.filter((e) => e.endedAt);

  const meetings = finished.filter((e) =>
    (isUs(e.attackerName) && norm(e.defenderName) === target) ||
    (norm(e.attackerName) === target && isUs(e.defenderName)));
  const oppGames = finished.filter((e) => norm(e.attackerName) === target || norm(e.defenderName) === target);
  const ourMapGames = mapCode
    ? finished.filter((e) => (isUs(e.attackerName) || isUs(e.defenderName)) && e.map === mapCode)
    : [];

  // Счёт очных встреч (по списку, без деталей)
  let w = 0, l = 0;
  for (const e of meetings) { const r = ourResult(e); if (r === true) w++; else if (r === false) l++; }
  const decided = w + l;
  const winPct = decided ? Math.round((w / decided) * 100) : null;
  const last10 = meetings.slice(0, 10)
    .map((e) => { const r = ourResult(e); return r === true ? '✅' : r === false ? '❌' : '➖'; })
    .join(' ') || '—';

  const detailCache = new Map();
  const detail = async (id) => {
    if (detailCache.has(id)) return detailCache.get(id);
    let d = null;
    try { d = await getJson(API_EVENT(id)); } catch { /* ignore */ }
    detailCache.set(id, d);
    return d;
  };

  // Очные встречи: средний урон сторон, топ игроков, винрейт по картам
  const ourAgg = new Map(), oppAgg = new Map(), mapWin = new Map();
  let ourDmg = 0, oppDmg = 0, dmgN = 0;
  for (const e of meetings.slice(0, 10)) {
    const d = await detail(e.eventId);
    if (!d) continue;
    const usAtt = isUs(e.attackerName);
    const oStats = usAtt ? d.attackerStats : d.defenderStats;
    const eStats = usAtt ? d.defenderStats : d.attackerStats;
    if (oStats && eStats) { ourDmg += oStats.damage || 0; oppDmg += eStats.damage || 0; dmgN++; }
    accRoster(ourAgg, usAtt ? d.attackers : d.defenders);
    accRoster(oppAgg, usAtt ? d.defenders : d.attackers);
    const r = ourResult(e);
    if (r !== null) { const mc = mapClean(e.map); const o = mapWin.get(mc) || { w: 0, l: 0 }; r ? o.w++ : o.l++; mapWin.set(mc, o); }
  }
  const ourAvgDmg = dmgN ? Math.round(ourDmg / dmgN) : null;
  const oppAvgDmg = dmgN ? Math.round(oppDmg / dmgN) : null;

  let best = null, worst = null;
  for (const [mc, o] of mapWin) {
    const tot = o.w + o.l; if (!tot) continue;
    const wr = o.w / tot;
    if (!best || wr > best.wr) best = { mc, wr, tot };
    if (!worst || wr < worst.wr) worst = { mc, wr, tot };
  }
  const mapLabel = (m) => m ? `${mapNameOf(m.mc) || m.mc} — ${Math.round(m.wr * 100)}% (${m.tot})` : '—';

  // Частый состав соперника
  const oppApp = new Map();
  let oppGN = 0;
  for (const e of oppGames.slice(0, 10)) {
    const d = await detail(e.eventId);
    if (!d) continue;
    oppGN++;
    const roster = norm(e.attackerName) === target ? d.attackers : d.defenders;
    for (const p of roster || []) oppApp.set(p.charName, (oppApp.get(p.charName) || 0) + 1);
  }
  const oppLineup = [...oppApp.entries()]
    .map(([n, c]) => ({ name: shortName(n), pct: Math.round((c / oppGN) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  // Наши лучшие на этой карте
  const ourMapAgg = new Map();
  for (const e of ourMapGames.slice(0, 10)) {
    const d = await detail(e.eventId);
    if (!d) continue;
    accRoster(ourMapAgg, isUs(e.attackerName) ? d.attackers : d.defenders);
  }
  const ourMapTop = topByDmg(ourMapAgg, 5);

  return {
    opponent, mapCode,
    meetings: meetings.length, w, l, winPct, last10,
    ourAvgDmg, oppAvgDmg,
    bestMap: best, worstMap: worst, // {mc, wr, tot}
    ourTop: topByDmg(ourAgg, 5),
    oppTop: topByDmg(oppAgg, 5),
    oppLineup, oppGN,
    ourMapTop,
  };
}

// Главный отчёт: возвращает массив эмбедов (1-2 шт). mapNameOf — резолвер кода карты в имя.
export async function buildVersusReport(opponent, mapCode, mapNameOf) {
  const d = await gatherVersusData(opponent, mapCode);
  if (!d) return [];

  const mapLabel = (m) => m ? `${mapNameOf(m.mc) || m.mc} — ${Math.round(m.wr * 100)}% (${m.tot})` : '—';

  const e1 = new EmbedBuilder()
    .setTitle(`⚔️ История против ${opponent}`)
    .setColor(0xe67e22)
    .setDescription(
      d.meetings === 0
        ? 'Очных встреч в истории не найдено.'
        : `Всего встреч: **${d.meetings}**\n` +
          `Победы/Поражения: **${d.w}** / **${d.l}**\n` +
          `Винрейт: **${d.winPct === null ? '—' : d.winPct + '%'}**\n` +
          `Последние: ${d.last10}`
    )
    .addFields(
      { name: '💥 Ср. урон команды', value: `Мы: **${d.ourAvgDmg ?? '—'}**\nОни: **${d.oppAvgDmg ?? '—'}**`, inline: true },
      { name: '🗺️ Карты против них', value: `✅ ${mapLabel(d.bestMap)}\n❌ ${mapLabel(d.worstMap)}`, inline: true },
      { name: '🏅 Топ у нас (очные)', value: playerTable(d.ourTop), inline: false },
      { name: '☠️ Топ у них (очные)', value: playerTable(d.oppTop), inline: false },
    )
    .setFooter({ text: '.aeterna • Аналитика' });

  const e2 = new EmbedBuilder()
    .setColor(0xf1c40f)
    .addFields(
      { name: `🎯 Частый состав ${opponent} (по ${d.oppGN} играм)`, value: lineupTable(d.oppLineup), inline: false },
      { name: `🏆 Наши лучшие на «${mapCode ? (mapNameOf(mapClean(mapCode)) || mapClean(mapCode)) : '—'}»`, value: playerTable(d.ourMapTop), inline: false },
    );

  return [e1, e2];
}
