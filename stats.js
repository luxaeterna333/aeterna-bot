// Сводная статистика семьи .aeterna из ОФИЦИАЛЬНОГО API организации (vzp-gta5rp.com).
// Полностью пересобирается после каждой игры: старые сообщения бота удаляются, шлётся новое.
import { EmbedBuilder } from 'discord.js';

const ORG_ID = 61760; // .aeterna
const H = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
const BASE = `https://vzp-gta5rp.com/api/stats/organizations/${ORG_ID}`;

let running = false;

async function getJson(url) {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

const medal = (i) => ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``;

export async function postFullStats(client) {
  const id = process.env.VZP_STATS_CHANNEL_ID;
  if (!id || running) return;
  running = true;
  try {
    const channel = await client.channels.fetch(id).catch(() => null);
    if (!channel) return;

    const [org, top, history] = await Promise.all([
      getJson(BASE).catch(() => null),
      getJson(`${BASE}/top-players?limit=12`).catch(() => []),
      getJson(`${BASE}/history?limit=50&offset=0`).catch(() => []),
    ]);
    if (!org) return;

    // Агрегация по картам из истории (map = "ТОЧКА — Карта")
    const maps = new Map();
    for (const h of history || []) {
      const name = (h.map || '').split('—').pop().trim() || h.map || '—';
      const m = maps.get(name) || { w: 0, l: 0 };
      if (h.isWin) m.w++; else m.l++;
      maps.set(name, m);
    }
    const mapLines = [...maps.entries()]
      .map(([n, m]) => ({ n, w: m.w, l: m.l, wr: Math.round((m.w / (m.w + m.l)) * 100) }))
      .sort((a, b) => b.wr - a.wr || (b.w + b.l) - (a.w + a.l))
      .map((m) => `**${m.n}** — ${m.w}-${m.l} (${m.wr}%)`)
      .join('\n') || '—';

    const streak = org.winStreak > 0 ? `🔥 ${org.winStreak} побед подряд`
      : org.lossStreak > 0 ? `❄️ ${org.lossStreak} поражений подряд` : '—';

    const overview = new EmbedBuilder()
      .setTitle(`📊 ${org.name} — статистика (${org.serverName})`)
      .setColor(org.winrate >= 50 ? 0x2ecc71 : 0xe74c3c)
      .setDescription(
        `**Всего ВЗП:** ${org.totalEvents}\n` +
        `**Победы / Поражения:** ${org.wins} / ${org.losses}\n` +
        `**Винрейт:** ${org.winrate}%\n` +
        `**Серия:** ${streak}\n` +
        `**Ранг:** #${org.rankServer} на сервере • #${org.rankGlobal} глобально`
      )
      .addFields({ name: '🗺️ По картам (по истории)', value: mapLines.slice(0, 1020), inline: false })
      .setTimestamp();

    const playerLines = (top || []).map((p, i) =>
      `${medal(i)} **${p.charName}** — K/D ${p.kd} • Урон ${p.damage} • WR ${p.winrate}% • ${p.eventsPlayed} игр`
    ).join('\n') || '—';

    const players = new EmbedBuilder()
      .setTitle('👤 Топ игроков')
      .setColor(0xf1c40f)
      .setDescription(playerLines.slice(0, 4000))
      .setFooter({ text: '.aeterna • обновляется после каждой ВЗП' });

    const old = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (old) for (const msg of old.values()) {
      if (msg.author?.id === client.user.id) await msg.delete().catch(() => {});
    }
    await channel.send({ embeds: [overview, players] });
    console.log('[stats] Сводка обновлена (официальный API)');
  } catch (e) {
    console.error('[stats] error:', e.message);
  } finally {
    running = false;
  }
}
