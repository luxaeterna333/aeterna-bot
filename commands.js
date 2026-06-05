// Слэш-команды аналитики .aeterna.
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { scanEvents, getJson, isUs, ourResult, accRoster, shortName, API_EVENT, gatherVersusData } from './scouting.js';
import { mapNameOf, codeFromInput, cleanCode } from './maps.js';
import { aiChat, aiEnabled } from './ai.js';
import { vzpCommandData, handleVzpCommand } from './commands-vzp.js';
import { rosterCommandData, isRosterCommand, handleRosterCommand } from './commands-roster.js';
import { errEmbed } from './cmd-util.js';

export const commandData = [
  new SlashCommandBuilder()
    .setName('mapstats')
    .setDescription('Статистика семьи .aeterna по всем картам'),
  new SlashCommandBuilder()
    .setName('maprating')
    .setDescription('Рейтинг игроков .aeterna на конкретной карте')
    .addStringOption((o) => o.setName('map').setDescription('Название карты, напр. Мясо').setRequired(true)),
  new SlashCommandBuilder()
    .setName('aibrief')
    .setDescription('ИИ-разбор соперника перед ВЗП')
    .addStringOption((o) => o.setName('opponent').setDescription('Семья соперника, напр. Cloud').setRequired(true))
    .addStringOption((o) => o.setName('map').setDescription('Карта (необязательно)').setRequired(false)),
].map((c) => c.toJSON()).concat(vzpCommandData).concat(rosterCommandData);

export async function handleCommand(interaction) {
  if (isRosterCommand(interaction.commandName)) return handleRosterCommand(interaction);
  if (interaction.commandName === 'mapstats') return mapStats(interaction);
  if (interaction.commandName === 'maprating') return mapRating(interaction);
  if (interaction.commandName === 'aibrief') return aiBrief(interaction);
  return handleVzpCommand(interaction);
}

// Текстовая сводка статистики для подачи в ИИ.
function versusToText(d) {
  const map = (m) => m ? `${mapNameOf(m.mc)} ${Math.round(m.wr * 100)}% (${m.tot} игр)` : '—';
  const ppl = (rows) => rows.map((r) => `${r.name}(${r.avgDmg} урон, ${r.avgK.toFixed(1)} килл)`).join(', ') || '—';
  const lineup = d.oppLineup.map((r) => `${r.name} ${r.pct}%`).join(', ') || '—';
  return [
    `Соперник: ${d.opponent}`,
    `Очных встреч: ${d.meetings}, победы/поражения наши: ${d.w}/${d.l}, винрейт наш: ${d.winPct ?? '—'}%`,
    `Средний урон команды в очных: мы ${d.ourAvgDmg ?? '—'}, они ${d.oppAvgDmg ?? '—'}`,
    `Лучшая карта против них: ${map(d.bestMap)}; худшая: ${map(d.worstMap)}`,
    `Топ игроков соперника (очные): ${ppl(d.oppTop)}`,
    `Частый состав соперника: ${lineup} (по ${d.oppGN} играм)`,
    `Наши лучшие на текущей карте: ${ppl(d.ourMapTop)}`,
  ].join('\n');
}

async function aiBrief(interaction) {
  await interaction.deferReply({ flags: 64 });
  if (!aiEnabled()) {
    return interaction.editReply({ embeds: [errEmbed('ИИ не настроен: задай точный `WELLFLOW_MODEL` в .env (id модели из дашборда wellflow).')] });
  }
  const opponent = interaction.options.getString('opponent');
  const mapInput = interaction.options.getString('map');
  const code = mapInput ? codeFromInput(mapInput) : null;

  const d = await gatherVersusData(opponent, code);
  if (!d) return interaction.editReply({ embeds: [errEmbed('Не удалось получить данные с API.')] });

  const brief = await aiChat([
    {
      role: 'system',
      content:
        'Ты — аналитик ВЗП (война за точку, GTA5RP) для семьи .aeterna. ' +
        'На основе статистики дай краткий тактический разбор соперника ПЕРЕД боем. ' +
        'Формат: 4–6 коротких пунктов на русском — сильные стороны врага, слабые стороны, на кого ставить, главные риски, рекомендация. ' +
        'Только конкретика, без воды и без выдумок сверх данных.',
    },
    { role: 'user', content: versusToText(d) },
  ], { maxTokens: 450, temperature: 0.5 });

  if (!brief) return interaction.editReply({ embeds: [errEmbed('ИИ не ответил (проверь модель/баланс).')] });

  const embed = new EmbedBuilder()
    .setTitle(`🤖 ИИ-разбор: ${opponent}`)
    .setColor(0x9b59b6)
    .setDescription(brief.slice(0, 4000))
    .setFooter({ text: `.aeterna • ИИ${code ? ' • карта ' + mapNameOf(code) : ''}` });
  await interaction.editReply({ embeds: [embed] });
}

// Узкая таблица игроков: Игрок Игр WR Урон (~19 симв.)
function ratingTable(rows) {
  if (!rows.length) return '—';
  const padR = (s, w) => String(s).slice(0, w).padEnd(w);
  const padL = (s, w) => String(s).padStart(w);
  const line = (n, g, wr, d) => padR(n, 7) + padL(g, 3) + padL(wr, 4) + padL(d, 5);
  const out = [line('Игрок', 'Игр', 'WR', 'Урон'), '─'.repeat(19),
    ...rows.map((r) => line(r.name, r.games, r.wr + '%', r.avgDmg))];
  return '```\n' + out.join('\n') + '\n```';
}

async function mapStats(interaction) {
  await interaction.deferReply({ flags: 64 });
  let all;
  try { all = await scanEvents(800); } catch { return interaction.editReply({ embeds: [errEmbed('API недоступно.')] }); }
  const our = all.filter((e) => e.endedAt && (isUs(e.attackerName) || isUs(e.defenderName)));
  if (!our.length) return interaction.editReply({ embeds: [errEmbed('Игр семьи не найдено.')] });

  const maps = new Map();
  for (const e of our.slice(0, 60)) {
    const d = await getJson(API_EVENT(e.eventId)).catch(() => null);
    if (!d) continue;
    const usAtt = isUs(e.attackerName);
    const stats = usAtt ? d.attackerStats : d.defenderStats;
    const roster = usAtt ? d.attackers : d.defenders;
    const code = cleanCode(e.map);
    const m = maps.get(code) || { games: 0, w: 0, l: 0, dmg: 0, kills: 0, players: new Map() };
    m.games++;
    const r = ourResult(e); if (r === true) m.w++; else if (r === false) m.l++;
    m.dmg += stats?.damage || 0;
    m.kills += stats?.kills || 0;
    accRoster(m.players, roster);
    maps.set(code, m);
  }

  const rows = [...maps.entries()].map(([code, m]) => {
    const dec = m.w + m.l;
    const wr = dec ? Math.round((m.w / dec) * 100) : 0;
    const ps = [...m.players.entries()]
      .map(([n, a]) => ({ n: shortName(n), avg: Math.round(a.damage / a.games) }))
      .sort((x, y) => y.avg - x.avg);
    return {
      name: mapNameOf(code), games: m.games, w: m.w, l: m.l, wr,
      avgDmg: Math.round(m.dmg / m.games), avgK: m.kills / m.games,
      best: ps[0], worst: ps[ps.length - 1],
    };
  }).sort((a, b) => b.wr - a.wr || b.games - a.games);

  const desc = rows.map((r) =>
    `🗺️ **${r.name}** — WR **${r.wr}%** (${r.w}-${r.l}, ${r.games} игр)\n` +
    `└ Урон ${r.avgDmg} • Киллы ${r.avgK.toFixed(1)} • 👑 ${r.best?.n ?? '—'} (${r.best?.avg ?? 0}) • 💩 ${r.worst?.n ?? '—'} (${r.worst?.avg ?? 0})`
  ).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('🗺️ Статистика .aeterna по картам')
    .setColor(0x3498db)
    .setDescription(desc.slice(0, 4000))
    .setFooter({ text: `.aeterna • по ${our.slice(0, 60).length} последним играм` });
  await interaction.editReply({ embeds: [embed] });
}

async function mapRating(interaction) {
  await interaction.deferReply({ flags: 64 });
  const input = interaction.options.getString('map');
  const code = codeFromInput(input);
  if (!code) return interaction.editReply({ embeds: [errEmbed(`Карта «${input}» не найдена. Примеры: Мясо, Байкерка, Муравейник.`)] });

  let all;
  try { all = await scanEvents(800); } catch { return interaction.editReply({ embeds: [errEmbed('API недоступно.')] }); }
  const games = all.filter((e) => e.endedAt && (isUs(e.attackerName) || isUs(e.defenderName)) && cleanCode(e.map) === cleanCode(code));
  if (!games.length) return interaction.editReply({ embeds: [errEmbed(`Игр на карте «${mapNameOf(code)}» не найдено.`)] });

  const players = new Map();
  for (const e of games.slice(0, 50)) {
    const d = await getJson(API_EVENT(e.eventId)).catch(() => null);
    if (!d) continue;
    const usAtt = isUs(e.attackerName);
    const roster = usAtt ? d.attackers : d.defenders;
    const won = ourResult(e) === true;
    for (const p of roster || []) {
      const a = players.get(p.charName) || { games: 0, wins: 0, dmg: 0, kills: 0 };
      a.games++; if (won) a.wins++; a.dmg += p.damage || 0; a.kills += p.kills || 0;
      players.set(p.charName, a);
    }
  }

  const rows = [...players.entries()]
    .map(([n, a]) => ({ name: shortName(n), games: a.games, wr: Math.round((a.wins / a.games) * 100), avgDmg: Math.round(a.dmg / a.games), avgK: a.kills / a.games }))
    .sort((x, y) => y.avgDmg - x.avgDmg)
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Рейтинг на карте «${mapNameOf(code)}»`)
    .setColor(0xf1c40f)
    .setDescription(`По ${games.slice(0, 50).length} играм семьи на этой карте.`)
    .addFields({ name: 'Топ по среднему урону', value: ratingTable(rows), inline: false })
    .setFooter({ text: '.aeterna • Рейтинг карты' });
  await interaction.editReply({ embeds: [embed] });
}
