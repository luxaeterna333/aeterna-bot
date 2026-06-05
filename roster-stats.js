// Ростер-статистика .aeterna: сканит нашу историю -> детали игр -> матрица игроков/пар/карт.
// Кэш 5 мин. На малой выборке (~23 игры) проценты низкодостоверны — помечаем в командах.
import { orgHistory, ourOrgId } from './vzp-org.js';
import { getJson, isUs, API_EVENT } from './scouting.js';

let cache = null, cacheT = 0;
const TTL = 5 * 60 * 1000;

export async function rosterStats(force = false) {
  if (!force && cache && Date.now() - cacheT < TTL) return cache;
  const hist = await orgHistory(ourOrgId(), 60).catch(() => []);
  const players = new Map(); // name -> {games,wins,kills,damage,last,games30}
  const pairs = new Map();   // "a|b" -> {games,wins}
  const maps = new Map();    // map -> {games,wins,players:Map}
  const log = [];            // [{won,map,teamDmg,names,date}]
  const now = Date.now();

  for (const h of hist) {
    const d = await getJson(API_EVENT(h.eventId)).catch(() => null);
    if (!d) continue;
    const usAtt = isUs(d.attackerName);
    const roster = (usAtt ? d.attackers : d.defenders) || [];
    const won = !!h.isWin;
    const t = new Date(h.date).getTime();
    const recent = now - t <= 30 * 86400000;
    const mapName = (h.map || '').split('—').pop().trim() || '—';
    const names = roster.map((p) => p.charName);
    log.push({ won, map: mapName, teamDmg: roster.reduce((s, p) => s + (p.damage || 0), 0), names, date: t });

    const me = maps.get(mapName) || { games: 0, wins: 0, players: new Map() };
    me.games++; if (won) me.wins++;
    for (const p of roster) {
      const a = players.get(p.charName) || { games: 0, wins: 0, kills: 0, damage: 0, last: 0, games30: 0, winKills: 0 };
      a.games++; if (won) { a.wins++; a.winKills += p.kills || 0; }
      a.kills += p.kills || 0; a.damage += p.damage || 0;
      if (t > a.last) a.last = t; if (recent) a.games30++;
      players.set(p.charName, a);
      const mp = me.players.get(p.charName) || { games: 0, wins: 0, damage: 0, kills: 0 };
      mp.games++; if (won) mp.wins++; mp.damage += p.damage || 0; mp.kills += p.kills || 0;
      me.players.set(p.charName, mp);
    }
    maps.set(mapName, me);
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const k = [names[i], names[j]].sort().join('|');
        const pr = pairs.get(k) || { games: 0, wins: 0 };
        pr.games++; if (won) pr.wins++; pairs.set(k, pr);
      }
  }
  cache = { players, pairs, maps, log, total: hist.length, builtAt: now };
  cacheT = now;
  return cache;
}

export const wr = (w, g) => (g ? Math.round((w / g) * 100) : 0);
export const avg = (sum, g) => (g ? Math.round(sum / g) : 0);
export const short = (s) => { const i = (s || '').lastIndexOf('_'); return (i > 0 ? s.slice(0, i) : s); };

// Топ игроков по эффективности (урон*винрейт*активность)
export function topPlayers(rs, n = 10) {
  return [...rs.players.entries()]
    .map(([name, a]) => ({ name, ...a, wr: wr(a.wins, a.games), avgDmg: avg(a.damage, a.games), avgK: a.kills / a.games }))
    .sort((x, y) => (y.avgDmg * (1 + y.wr / 100)) - (x.avgDmg * (1 + x.wr / 100)))
    .slice(0, n);
}

// Лучшие связки (пары) — минимум minGames совместных игр
export function bestPairs(rs, minGames = 2, n = 8) {
  return [...rs.pairs.entries()]
    .map(([k, p]) => { const [a, b] = k.split('|'); return { a, b, games: p.games, wr: wr(p.wins, p.games) }; })
    .filter((p) => p.games >= minGames)
    .sort((x, y) => y.wr - x.wr || y.games - x.games)
    .slice(0, n);
}

// С кем лучше играет конкретный игрок
export function whoFits(rs, name, minGames = 1, n = 6) {
  const res = [];
  for (const [k, p] of rs.pairs) {
    const parts = k.split('|');
    if (!parts.includes(name)) continue;
    if (p.games < minGames) continue;
    const partner = parts[0] === name ? parts[1] : parts[0];
    res.push({ partner, games: p.games, wr: wr(p.wins, p.games) });
  }
  return res.sort((x, y) => y.wr - x.wr || y.games - x.games).slice(0, n);
}

// Лучшая пятёрка (жадно по эффективности) + ожидаемый винрейт
export function bestLineup(rs, size = 5) {
  const top = topPlayers(rs, 30).filter((p) => p.games >= 1);
  const main = top.slice(0, size);
  const bench = top.slice(size, size + 3);
  const expWr = main.length ? Math.round(main.reduce((s, p) => s + p.wr, 0) / main.length) : 0;
  return { main, bench, expWr };
}

// Лучшие игроки на конкретной карте
export function mapTeam(rs, mapQ, n = 6) {
  const key = [...rs.maps.keys()].find((k) => k.toLowerCase().includes(mapQ.toLowerCase()));
  if (!key) return null;
  const me = rs.maps.get(key);
  const players = [...me.players.entries()]
    .map(([name, p]) => ({ name, games: p.games, wr: wr(p.wins, p.games), avgDmg: avg(p.damage, p.games) }))
    .sort((x, y) => y.wr - x.wr || y.avgDmg - x.avgDmg)
    .slice(0, n);
  return { map: key, games: me.games, wr: wr(me.wins, me.games), players };
}

// Неактивные (дней с последней игры >= days)
export function inactive(rs, days = 7) {
  const now = Date.now();
  return [...rs.players.entries()]
    .map(([name, a]) => ({ name, days: Math.floor((now - a.last) / 86400000), games: a.games }))
    .filter((p) => p.days >= days)
    .sort((x, y) => y.days - x.days);
}

// Посещаемость за 30 дней
export function attendance(rs) {
  return [...rs.players.entries()]
    .map(([name, a]) => ({ name, games30: a.games30, total: a.games, last: a.last }))
    .sort((x, y) => y.games30 - x.games30);
}
