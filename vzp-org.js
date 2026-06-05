// Клиент официального API статистики vzp-gta5rp.com (семьи и игроки).
const H = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
const BASE = 'https://vzp-gta5rp.com/api/stats';
const SERVER = 12; // Rockford
const OUR_ORG_ID = 61760; // .aeterna

const cache = new Map(); // url -> {t, data}
const TTL = 3 * 60 * 1000;

async function get(url) {
  const c = cache.get(url);
  if (c && Date.now() - c.t < TTL) return c.data;
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  cache.set(url, { t: Date.now(), data });
  return data;
}

export const ourOrgId = () => OUR_ORG_ID;
export const mapNameFromHistory = (m) => (m || '').split('—').pop().trim() || m || '—';

// --- Семьи ---
export async function searchOrg(name) {
  const list = await get(`${BASE}/organizations?search=${encodeURIComponent(name)}`).catch(() => []);
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((o) => o.serverId === SERVER) || list[0];
}
export const orgOverview = (id) => get(`${BASE}/organizations/${id}`);
export const orgTopPlayers = (id, limit = 12) => get(`${BASE}/organizations/${id}/top-players?limit=${limit}`);
export const orgHistory = (id, limit = 50) => get(`${BASE}/organizations/${id}/history?limit=${limit}&offset=0`);

// Удобный резолвер: имя семьи -> {overview, top, history} (или null)
export async function orgBundle(name, { topN = 12, histN = 50 } = {}) {
  const found = await searchOrg(name);
  if (!found) return null;
  const id = found.externalId ?? found.id; // суб-эндпоинты используют externalId
  const [overview, top, history] = await Promise.all([
    orgOverview(id).catch(() => found),
    orgTopPlayers(id, topN).catch(() => []),
    orgHistory(id, histN).catch(() => []),
  ]);
  return { id, overview, top, history };
}

// --- Карты (глобальная статистика атака/защита) ---
export const allMaps = () => get(`${BASE}/maps`);

// --- Игроки ---
export async function searchPlayer(name) {
  const list = await get(`${BASE}/players?search=${encodeURIComponent(name)}`).catch(() => []);
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((p) => p.serverId === SERVER) || list[0];
}
export const playerProfile = (charId, server = SERVER) => get(`${BASE}/players/${charId}-${server}`);
export const playerHistory = (charId, server = SERVER, limit = 50) =>
  get(`${BASE}/players/${charId}-${server}/history?limit=${limit}&offset=0`);

// --- Агрегация истории по картам: {map: {w,l,games,wr}} ---
export function mapsFromHistory(history) {
  const maps = new Map();
  for (const h of history || []) {
    const name = mapNameFromHistory(h.map);
    const m = maps.get(name) || { w: 0, l: 0 };
    if (h.isWin) m.w++; else m.l++;
    maps.set(name, m);
  }
  return [...maps.entries()]
    .map(([name, m]) => ({ name, w: m.w, l: m.l, games: m.w + m.l, wr: Math.round((m.w / (m.w + m.l)) * 100) }))
    .sort((a, b) => b.wr - a.wr || b.games - a.games);
}

// Винрейт за последние N дней из истории
export function winrateWindow(history, days) {
  const since = Date.now() - days * 86400000;
  let w = 0, l = 0;
  for (const h of history || []) {
    if (new Date(h.date).getTime() < since) continue;
    if (h.isWin) w++; else l++;
  }
  const g = w + l;
  return { w, l, games: g, wr: g ? Math.round((w / g) * 100) : null };
}
