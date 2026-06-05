// Ростер-сюита + менеджмент + rule-based «ИИ» команды. Все ответы скрытые (ephemeral), эмбедами.
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { deferHidden, replyErr } from './cmd-util.js';
import { aiChat, aiEnabled } from './ai.js';
import { orgBundle, mapsFromHistory, allMaps } from './vzp-org.js';
import { mapNameOf, cleanCode } from './maps.js';
import { rosterStats, topPlayers, bestPairs, whoFits, bestLineup, mapTeam, inactive, attendance, wr, avg } from './roster-stats.js';

const playerOpt = (o) => o.setName('player').setDescription('Игровой ник (напр. Lux_Aeterna)').setRequired(true);

export const rosterCommandData = [
  new SlashCommandBuilder().setName('synergy').setDescription('Лучшие связки и пятёрка .aeterna'),
  new SlashCommandBuilder().setName('whofits').setDescription('С кем лучше играет игрок').addStringOption(playerOpt),
  new SlashCommandBuilder().setName('lineup').setDescription('Автосбор лучшего состава'),
  new SlashCommandBuilder().setName('replace').setDescription('Лучшие замены игроку').addStringOption(playerOpt),
  new SlashCommandBuilder().setName('mapteam').setDescription('Лучший состав на карте').addStringOption((o) => o.setName('map').setDescription('Карта, напр. Мясо').setRequired(true)),
  new SlashCommandBuilder().setName('inactive').setDescription('Неактивные игроки'),
  new SlashCommandBuilder().setName('attendance-month').setDescription('Посещаемость за 30 дней'),
  new SlashCommandBuilder().setName('recruit').setDescription('Кандидаты на повышение'),
  new SlashCommandBuilder().setName('penalty').setDescription('Список на штрафы (пропуски)'),
  new SlashCommandBuilder().setName('brief').setDescription('Сводка перед ВЗП (шанс победы + рекомендации)').addStringOption((o) => o.setName('opponent').setDescription('Соперник').setRequired(true)).addStringOption((o) => o.setName('map').setDescription('Карта').setRequired(false)),
  new SlashCommandBuilder().setName('draft').setDescription('Рекомендуемый состав на забив').addStringOption((o) => o.setName('opponent').setDescription('Соперник (необязательно)').setRequired(false)),
  new SlashCommandBuilder().setName('whylose').setDescription('Анализ причин последних поражений'),
  new SlashCommandBuilder().setName('coach').setDescription('ИИ-тренер: что улучшить'),
  new SlashCommandBuilder().setName('freewin').setDescription('Семьи, против которых у нас лучший винрейт'),
  new SlashCommandBuilder().setName('clutch').setDescription('Лучшие клатчеры (по результативности в победах)'),
  new SlashCommandBuilder().setName('form').setDescription('Текущая форма игроков (тренд)'),
  new SlashCommandBuilder().setName('whatif').setDescription('Симуляция: заменить одного игрока на другого')
    .addStringOption((o) => o.setName('out').setDescription('Кого убрать (ник)').setRequired(true))
    .addStringOption((o) => o.setName('in').setDescription('Кого поставить (ник)').setRequired(true)),
  new SlashCommandBuilder().setName('record').setDescription('Рекорды семьи'),
  new SlashCommandBuilder().setName('matchup').setDescription('Разбор противостояния с семьёй')
    .addStringOption((o) => o.setName('family').setDescription('Семья').setRequired(true)),
  new SlashCommandBuilder().setName('mapside').setDescription('Кому выгоднее карта (атака/защита)')
    .addStringOption((o) => o.setName('map').setDescription('Карта (необязательно)').setRequired(false)),
].map((c) => c.toJSON());

const NAMES = new Set(rosterCommandData.map((c) => c.name));
export function isRosterCommand(name) { return NAMES.has(name); }

export async function handleRosterCommand(interaction) {
  await deferHidden(interaction);
  const c = interaction.commandName;
  try {
    if (c === 'synergy') return synergy(interaction);
    if (c === 'whofits') return whofitsCmd(interaction);
    if (c === 'lineup') return lineupCmd(interaction);
    if (c === 'replace') return replaceCmd(interaction);
    if (c === 'mapteam') return mapteamCmd(interaction);
    if (c === 'inactive') return inactiveCmd(interaction);
    if (c === 'attendance-month') return attendanceCmd(interaction);
    if (c === 'recruit') return recruitCmd(interaction);
    if (c === 'penalty') return penaltyCmd(interaction);
    if (c === 'brief') return brief(interaction);
    if (c === 'draft') return draft(interaction);
    if (c === 'whylose') return whylose(interaction);
    if (c === 'coach') return coach(interaction);
    if (c === 'freewin') return freewin(interaction);
    if (c === 'clutch') return clutch(interaction);
    if (c === 'form') return form(interaction);
    if (c === 'whatif') return whatif(interaction);
    if (c === 'record') return record(interaction);
    if (c === 'matchup') return matchup(interaction);
    if (c === 'mapside') return mapside(interaction);
  } catch (e) { return replyErr(interaction, 'Ошибка: ' + e.message); }
}

const SN = (s) => { const i = (s || '').lastIndexOf('_'); return i > 0 ? s.slice(0, i) : s; };
const conf = (g) => (g < 5 ? ' ⚠️ мало игр' : '');
const E = (title, color = 0x2ecc71) => new EmbedBuilder().setTitle(title).setColor(color).setFooter({ text: '.aeterna' });
const findName = (rs, q) => [...rs.players.keys()].find((n) => n.toLowerCase().includes(q.toLowerCase()));

// ИИ-вывод поверх посчитанных данных (или null если ИИ выключен)
async function aiNote(sys, data) {
  if (!aiEnabled()) return null;
  try { return await aiChat([{ role: 'system', content: sys }, { role: 'user', content: data }], { maxTokens: 300, temperature: 0.5 }); }
  catch { return null; }
}

async function synergy(i) {
  const rs = await rosterStats();
  if (!rs.total) return replyErr(i, 'Нет данных по играм.');
  const pairs = bestPairs(rs, 2, 8);
  const lu = bestLineup(rs);
  const pairsStr = pairs.map((p) => `${SN(p.a)} + ${SN(p.b)} — ${p.wr}% (${p.games})`).join('\n') || '_мало совместных игр_';
  const five = lu.main.map((p) => SN(p.name)).join(', ');
  await i.editReply({ embeds: [E('🤝 Синергия .aeterna', 0x1abc9c)
    .setDescription(`Проанализировано игр: **${rs.total}**${conf(rs.total)}`)
    .addFields({ name: 'Лучшие связки', value: pairsStr }, { name: 'Рекомендуемая пятёрка', value: `${five}\nОжидаемый винрейт: **${lu.expWr}%**` })] });
}

async function whofitsCmd(i) {
  const rs = await rosterStats();
  const q = i.options.getString('player');
  const name = findName(rs, q);
  if (!name) return replyErr(i, `Игрок «${q}» не найден в составах.`);
  const list = whoFits(rs, name).map((p) => `${SN(p.partner)} — ${p.wr}% (${p.games})`).join('\n') || '_нет совместных игр_';
  await i.editReply({ embeds: [E(`🤝 Связки: ${SN(name)}`, 0x1abc9c).setDescription(list)] });
}

async function lineupCmd(i) {
  const rs = await rosterStats();
  if (!rs.total) return replyErr(i, 'Нет данных по играм.');
  const lu = bestLineup(rs);
  const fmt = (p) => `${SN(p.name)} — ${p.wr}% WR, ${p.avgDmg} урон (${p.games})`;
  await i.editReply({ embeds: [E('📋 Рекомендуемый состав', 0x2ecc71)
    .setDescription(`По эффективности${conf(rs.total)}`)
    .addFields(
      { name: 'Основа', value: lu.main.map(fmt).join('\n') || '—' },
      { name: 'Запас', value: lu.bench.map(fmt).join('\n') || '—' },
      { name: 'Ожидаемый винрейт', value: `**${lu.expWr}%**` },
    )] });
}

async function replaceCmd(i) {
  const rs = await rosterStats();
  const q = i.options.getString('player');
  const name = findName(rs, q);
  const lu = bestLineup(rs);
  const mainNames = new Set(lu.main.map((p) => p.name));
  const cands = topPlayers(rs, 30).filter((p) => !mainNames.has(p.name) && p.name !== name).slice(0, 5);
  const list = cands.map((p) => `${SN(p.name)} — ${p.wr}% WR, ${p.avgDmg} урон`).join('\n') || '—';
  await i.editReply({ embeds: [E(`🔄 Замены${name ? ' вместо ' + SN(name) : ''}`, 0xe67e22).setDescription(list)] });
}

async function mapteamCmd(i) {
  const rs = await rosterStats();
  const mt = mapTeam(rs, i.options.getString('map'));
  if (!mt) return replyErr(i, 'Игр на этой карте не найдено.');
  const list = mt.players.map((p) => `${SN(p.name)} — ${p.wr}% (${p.games}), ${p.avgDmg} урон`).join('\n') || '—';
  await i.editReply({ embeds: [E(`🗺️ Состав на «${mt.map}»`, 0x3498db).setDescription(`Карта: ${mt.wr}% WR (${mt.games} игр)`).addFields({ name: 'Лучшие игроки', value: list })] });
}

async function inactiveCmd(i) {
  const rs = await rosterStats();
  const list = inactive(rs, 7).map((p) => `${SN(p.name)} — **${p.days}** дн. назад`).join('\n') || 'Все активны ✅';
  await i.editReply({ embeds: [E('💤 Неактивные (7+ дней)', 0x95a5a6).setDescription(list)] });
}

async function attendanceCmd(i) {
  const rs = await rosterStats();
  const list = attendance(rs).map((p) => `${SN(p.name)} — **${p.games30}** игр / 30 дн (всего ${p.total})`).join('\n') || '—';
  await i.editReply({ embeds: [E('📅 Посещаемость за 30 дней', 0x3498db).setDescription(list)] });
}

async function recruitCmd(i) {
  const rs = await rosterStats();
  const cands = topPlayers(rs, 30).filter((p) => p.games30 >= 2).sort((a, b) => (b.avgDmg * (1 + b.wr / 100)) - (a.avgDmg * (1 + a.wr / 100))).slice(0, 6);
  const list = cands.map((p) => `${SN(p.name)} — ${p.avgDmg} урон, ${p.wr}% WR, ${p.games30} игр/мес`).join('\n') || '—';
  await i.editReply({ embeds: [E('⬆️ Кандидаты на повышение', 0x2ecc71).setDescription('Активные и результативные:\n' + list)] });
}

async function penaltyCmd(i) {
  const rs = await rosterStats();
  const list = inactive(rs, 10).map((p) => `${SN(p.name)} — пропуск **${p.days}** дн.`).join('\n') || 'Нарушителей нет ✅';
  await i.editReply({ embeds: [E('⛔ На штраф (пропуски 10+ дней)', 0xe74c3c).setDescription(list)] });
}

function winChance(us, them, usMapWr, themMapWr) {
  let p = 50 + (us.winrate - them.winrate) / 3;
  if (usMapWr != null && themMapWr != null) p += (usMapWr - themMapWr) / 4;
  if (them.lossStreak >= 2) p += 6; if (them.winStreak >= 2) p -= 6;
  if (us.winStreak >= 2) p += 5; if (us.lossStreak >= 2) p -= 5;
  return Math.max(15, Math.min(85, Math.round(p)));
}

async function brief(i) {
  const name = i.options.getString('opponent');
  const mapQ = i.options.getString('map');
  const [them, us, rs] = await Promise.all([orgBundle(name).catch(() => null), orgBundle('.aeterna').catch(() => null), rosterStats()]);
  if (!them || !us) return replyErr(i, `Семья «${name}» не найдена.`);
  let usMapWr = null, themMapWr = null, mapName = null;
  if (mapQ) {
    const um = mapsFromHistory(us.history).find((m) => m.name.toLowerCase().includes(mapQ.toLowerCase()));
    const tm = mapsFromHistory(them.history).find((m) => m.name.toLowerCase().includes(mapQ.toLowerCase()));
    usMapWr = um?.wr ?? null; themMapWr = tm?.wr ?? null; mapName = um?.name || tm?.name || mapQ;
  }
  const chance = winChance(us.overview, them.overview, usMapWr, themMapWr);
  const avgD = (p) => (p.eventsPlayed ? Math.round(p.damage / p.eventsPlayed) : 0);
  const danger = [...them.top].sort((a, b) => avgD(b) - avgD(a)).slice(0, 3).map((p) => `${p.charName} (${avgD(p)} урон, K/D ${p.kd})`).join('\n') || '—';
  const lu = bestLineup(rs).main.map((p) => SN(p.name)).join(', ');
  const f = [];
  if (them.overview.lossStreak >= 2) f.push(`+ у них серия поражений (${them.overview.lossStreak})`);
  if (us.overview.winStreak >= 2) f.push(`+ у нас серия побед (${us.overview.winStreak})`);
  if (themMapWr != null && themMapWr >= 60) f.push(`- карта в их топе (${themMapWr}%)`);
  if (usMapWr != null && usMapWr >= 60) f.push(`+ мы сильны на этой карте (${usMapWr}%)`);
  if (them.overview.winrate >= 55) f.push(`- у них высокий винрейт (${them.overview.winrate}%)`);
  const emb = E(`🧠 Сводка: ${them.overview.name}`, chance >= 50 ? 0x2ecc71 : 0xe74c3c)
    .setDescription(`**Шанс победы: ${chance}%**${mapName ? ` (карта ${mapName})` : ''}\n_эвристика по форме/карте/очным_`)
    .addFields(
      { name: 'Ключевые факторы', value: f.join('\n') || '—' },
      { name: '☠️ Опасные игроки', value: danger },
      { name: '📋 Рекомендуемый состав', value: lu || '—' },
    );
  const note = await aiNote(
    'Ты — тренер ВЗП семьи .aeterna. На основе сводки дай краткий вердикт и тактику на бой: 2-4 предложения, по-русски, конкретно, без воды.',
    `Соперник ${them.overview.name}. Шанс победы ${chance}%${mapName ? `, карта ${mapName}` : ''}. Факторы: ${f.join('; ') || '—'}. Опасные: ${danger.replace(/\n/g, '; ')}. Наш состав: ${lu}.`);
  if (note) emb.addFields({ name: '🤖 Вывод ИИ', value: note.slice(0, 1020) });
  await i.editReply({ embeds: [emb] });
}

async function draft(i) {
  const name = i.options.getString('opponent');
  const rs = await rosterStats();
  const lu = bestLineup(rs);
  let chance = lu.expWr, reason = 'по средней эффективности состава';
  if (name) {
    const [them, us] = await Promise.all([orgBundle(name).catch(() => null), orgBundle('.aeterna').catch(() => null)]);
    if (them && us) { chance = winChance(us.overview, them.overview, null, null); reason = `против ${them.overview.name} (форма ${us.overview.winrate}% vs ${them.overview.winrate}%)`; }
  }
  await i.editReply({ embeds: [E('⚡ Состав на забив', 0xf1c40f)
    .addFields(
      { name: 'Основа', value: lu.main.map((p, n) => `${n + 1}. ${SN(p.name)}`).join('\n') || '—' },
      { name: 'Запас', value: lu.bench.map((p) => SN(p.name)).join('\n') || '—' },
      { name: 'Шанс победы', value: `**${chance}%**` },
      { name: 'Причина', value: reason },
    )] });
}

async function whylose(i) {
  const rs = await rosterStats();
  const losses = rs.log.filter((g) => !g.won).slice(0, 10);
  if (!losses.length) return replyErr(i, 'Поражений в истории нет.');
  const dmgs = rs.log.map((g) => g.teamDmg).sort((a, b) => a - b);
  const median = dmgs[Math.floor(dmgs.length / 2)] || 0;
  const core = new Set(topPlayers(rs, 5).map((p) => p.name));
  let lowDmg = 0, badMap = 0, missCore = 0;
  for (const g of losses) {
    if (g.teamDmg < median * 0.85) lowDmg++;
    const m = rs.maps.get(g.map); if (m && wr(m.wins, m.games) < 40) badMap++;
    const present = g.names.filter((n) => core.has(n)).length;
    if (present < 3) missCore++;
  }
  const pct = (x) => Math.round((x / losses.length) * 100);
  await i.editReply({ embeds: [E('💀 Почему проигрываем', 0xe74c3c)
    .setDescription(`Последние ${losses.length} поражений:`)
    .addFields(
      { name: 'Низкий урон команды', value: `${pct(lowDmg)}%`, inline: true },
      { name: 'Неудобная карта', value: `${pct(badMap)}%`, inline: true },
      { name: 'Не было основы', value: `${pct(missCore)}%`, inline: true },
    )] });
}

async function coach(i) {
  const [us, rs] = await Promise.all([orgBundle('.aeterna').catch(() => null), rosterStats()]);
  if (!us) return replyErr(i, 'Нет данных.');
  const maps = mapsFromHistory(us.history);
  const weakMaps = maps.filter((m) => m.games >= 2 && m.wr <= 45).slice(0, 3);
  const lowKd = [...us.top].filter((p) => p.kd < 0.6 && p.eventsPlayed >= 3).slice(0, 3);
  const W = [];
  if (us.overview.winrate < 45) W.push(`• низкий общий винрейт (${us.overview.winrate}%)`);
  if (weakMaps.length) W.push(`• просадка на картах: ${weakMaps.map((m) => `${m.name} (${m.wr}%)`).join(', ')}`);
  if (lowKd.length) W.push(`• низкая выживаемость: ${lowKd.map((p) => `${p.charName} (K/D ${p.kd})`).join(', ')}`);
  if (us.overview.lossStreak >= 2) W.push(`• серия поражений (${us.overview.lossStreak}) — нужен разбор`);
  const emb = E('🎓 ИИ-тренер: что улучшить', 0x9b59b6).setDescription(W.join('\n') || 'Слабых мест по данным не видно ✅');
  const note = await aiNote(
    'Ты — тренер ВЗП .aeterna. Дай план улучшения: 3-4 конкретных пункта на русском, без воды.',
    `Слабые места семьи: ${W.join('; ') || 'явных нет'}. Винрейт ${us.overview.winrate}%.`);
  if (note) emb.addFields({ name: '🤖 План от ИИ', value: note.slice(0, 1020) });
  await i.editReply({ embeds: [emb] });
}

async function freewin(i) {
  const us = await orgBundle('.aeterna').catch(() => null);
  if (!us) return replyErr(i, 'Нет данных.');
  const byOpp = new Map();
  for (const h of us.history) { const o = byOpp.get(h.opponentName) || { w: 0, l: 0 }; h.isWin ? o.w++ : o.l++; byOpp.set(h.opponentName, o); }
  const rows = [...byOpp.entries()].map(([n, o]) => ({ n, w: o.w, l: o.l, g: o.w + o.l, wr: wr(o.w, o.w + o.l) }))
    .sort((a, b) => b.wr - a.wr || b.g - a.g).slice(0, 10);
  const list = rows.map((r) => `**${r.n}** — ${r.wr}% (${r.w}-${r.l})`).join('\n') || '—';
  await i.editReply({ embeds: [E('😋 Удобные соперники (лучший WR)', 0x2ecc71).setDescription(list)] });
}

async function clutch(i) {
  const rs = await rosterStats();
  const rows = [...rs.players.entries()].map(([name, a]) => ({ name, wins: a.wins, ak: a.wins ? a.winKills / a.wins : 0 }))
    .filter((p) => p.wins >= 1).sort((x, y) => y.ak - x.ak).slice(0, 8);
  const list = rows.map((p, idx) => `${idx + 1}. ${SN(p.name)} — ${p.ak.toFixed(1)} килла/победу (${p.wins} побед)`).join('\n') || '—';
  await i.editReply({ embeds: [E('🔥 Клатчеры', 0xe67e22).setDescription('_прокси: ср. киллы в победных ВЗП — данных об игре «в меньшинстве» в API нет_\n\n' + list)] });
}

async function form(i) {
  const rs = await rosterStats();
  const log = [...rs.log].sort((a, b) => b.date - a.date);
  const byP = new Map();
  for (const g of log) for (const n of g.names) { if (!byP.has(n)) byP.set(n, []); byP.get(n).push(g.won); }
  const rows = [...byP.entries()].map(([name, res]) => {
    const recent = res.slice(0, 5);
    const rwv = recent.filter(Boolean).length / recent.length * 100;
    const allv = res.filter(Boolean).length / res.length * 100;
    const d = rwv - allv; const t = d > 10 ? '↑' : d < -10 ? '↓' : '→';
    return { name, t, rw: Math.round(rwv), n: res.length };
  }).sort((a, b) => b.n - a.n).slice(0, 12);
  const list = rows.map((r) => `${r.t} ${SN(r.name)} — ${r.rw}% (посл. ${Math.min(5, r.n)})`).join('\n') || '—';
  await i.editReply({ embeds: [E('📈 Форма игроков', 0x3498db).setDescription(list)] });
}

async function whatif(i) {
  const rs = await rosterStats();
  const outN = findName(rs, i.options.getString('out'));
  const inN = findName(rs, i.options.getString('in'));
  if (!outN || !inN) return replyErr(i, 'Игрок не найден в составах.');
  const pl = (n) => { const a = rs.players.get(n); return { wr: wr(a.wins, a.games), dmg: avg(a.damage, a.games) }; };
  const o = pl(outN), inp = pl(inN);
  const dWr = Math.round((inp.wr - o.wr) / 5);
  await i.editReply({ embeds: [E('🔀 Симуляция замены', 0x9b59b6).setDescription(
    `Заменить **${SN(outN)}** (${o.wr}% WR, ${o.dmg} урон) на **${SN(inN)}** (${inp.wr}% WR, ${inp.dmg} урон)\n\n` +
    `Оценка шанса победы: **${dWr >= 0 ? '+' : ''}${dWr}%**\n_эвристика по WR игроков; малая выборка_`)] });
}

async function record(i) {
  const [us, rs] = await Promise.all([orgBundle('.aeterna').catch(() => null), rosterStats()]);
  if (!us) return replyErr(i, 'Нет данных.');
  let max = 0, cur = 0;
  for (const h of [...us.history].reverse()) { if (h.isWin) { cur++; if (cur > max) max = cur; } else cur = 0; }
  let bestG = null; for (const g of rs.log) if (!bestG || g.teamDmg > bestG.teamDmg) bestG = g;
  const months = new Map();
  for (const h of us.history) { const m = (h.date || '').slice(0, 7); const o = months.get(m) || { w: 0, l: 0 }; h.isWin ? o.w++ : o.l++; months.set(m, o); }
  const bm = [...months.entries()].map(([m, o]) => ({ m, wr: wr(o.w, o.w + o.l), g: o.w + o.l })).filter((x) => x.g >= 2).sort((a, b) => b.wr - a.wr)[0];
  const lu = bestLineup(rs).main.map((p) => SN(p.name)).join(', ');
  await i.editReply({ embeds: [E('🏆 Рекорды .aeterna', 0xf1c40f).addFields(
    { name: 'Макс. винстрик', value: `${max} подряд`, inline: true },
    { name: 'Макс. урон команды', value: bestG ? `${bestG.teamDmg} (${bestG.map})` : '—', inline: true },
    { name: 'Лучший месяц', value: bm ? `${bm.m} — ${bm.wr}% (${bm.g})` : '—', inline: true },
    { name: 'Лучший состав', value: lu || '—', inline: false },
  )] });
}

async function matchup(i) {
  const name = i.options.getString('family');
  const [them, us] = await Promise.all([orgBundle(name).catch(() => null), orgBundle('.aeterna').catch(() => null)]);
  if (!them || !us) return replyErr(i, `Семья «${name}» не найдена.`);
  const tn = them.overview.name.toLowerCase();
  const vs = us.history.filter((h) => (h.opponentName || '').toLowerCase() === tn);
  const w = vs.filter((h) => h.isWin).length, l = vs.length - w;
  const avgD = (p) => (p.eventsPlayed ? Math.round(p.damage / p.eventsPlayed) : 0);
  const star = [...them.top].sort((a, b) => avgD(b) - avgD(a))[0];
  const tMaps = mapsFromHistory(them.history).filter((m) => m.games >= 2 && m.wr >= 60).slice(0, 3).map((m) => m.name);
  const lose = [], win = [], chg = [];
  if (them.overview.winrate > us.overview.winrate) lose.push(`у них выше винрейт (${them.overview.winrate}% vs ${us.overview.winrate}%)`);
  if (star) lose.push(`силён ${star.charName} (${avgD(star)} урон, K/D ${star.kd})`);
  if (tMaps.length) lose.push(`их топ-карты: ${tMaps.join(', ')}`);
  if (w > l) win.push(`в очных ведём ${w}-${l}`);
  if (us.overview.winStreak >= 2) win.push(`мы в форме (винстрик ${us.overview.winStreak})`);
  if (them.overview.lossStreak >= 2) win.push(`они в просадке (${them.overview.lossStreak} пораж.)`);
  if (star) chg.push(`фокусить ${star.charName} в начале`);
  if (tMaps.length) chg.push(`не давать их карты (${tMaps.slice(0, 2).join(', ')})`);
  chg.push('держать плотный состав, не растягиваться');
  const emb = E(`🆚 Матчап: .aeterna vs ${them.overview.name}`, 0x9b59b6).addFields(
    { name: '🩸 Почему проигрываем', value: lose.map((x) => '• ' + x).join('\n') || '—' },
    { name: '💪 Почему выигрываем', value: win.map((x) => '• ' + x).join('\n') || '—' },
    { name: '🎯 Что изменить', value: chg.map((x) => '• ' + x).join('\n') || '—' },
  ).setFooter({ text: `.aeterna • очные: ${w}-${l}` });
  const note = await aiNote(
    'Ты — тренер ВЗП .aeterna. Дай краткий реальный план на этого соперника: 2-4 предложения, по-русски, конкретно.',
    `Соперник ${them.overview.name}, очные ${w}-${l}. Проигрываем: ${lose.join('; ') || '—'}. Выигрываем: ${win.join('; ') || '—'}. Менять: ${chg.join('; ')}.`);
  if (note) emb.addFields({ name: '🤖 Вывод ИИ', value: note.slice(0, 1020) });
  await i.editReply({ embeds: [emb] });
}

async function mapside(i) {
  const maps = await allMaps().catch(() => []);
  if (!maps.length) return replyErr(i, 'Не удалось получить статистику карт.');
  const named = maps.map((m) => ({ ...m, ru: mapNameOf(m.map) }));
  const q = i.options.getString('map');
  if (q) {
    const m = named.find((x) => x.ru.toLowerCase().includes(q.toLowerCase()) || x.map.toLowerCase().includes(q.toLowerCase()));
    if (!m) return replyErr(i, `Карта «${q}» не найдена.`);
    const side = m.attackWinrate > m.defenseWinrate ? '⚔️ выгоднее АТАКЕ' : '🛡️ выгоднее ЗАЩИТЕ';
    await i.editReply({ embeds: [E(`🗺️ ${m.ru}: кому выгоднее`, 0x3498db).setDescription(
      `Атака: **${m.attackWinrate}%** • Защита: **${m.defenseWinrate}%**\n**${side}**\n_по ${m.total} играм (глобально)_`)] });
  } else {
    const list = named.sort((a, b) => Math.abs(b.attackWinrate - 50) - Math.abs(a.attackWinrate - 50)).slice(0, 14)
      .map((m) => `${m.attackWinrate > m.defenseWinrate ? '⚔️' : '🛡️'} **${m.ru}** — атк ${m.attackWinrate}% / деф ${m.defenseWinrate}%`).join('\n');
    await i.editReply({ embeds: [E('🗺️ Кому выгоднее карты (глобально)', 0x3498db).setDescription(list)] });
  }
}
