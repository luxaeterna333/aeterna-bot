// Слэш-команды разведки/подготовки на официальных данных (vzp-org.js).
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { orgBundle, mapsFromHistory, winrateWindow, ourOrgId, orgOverview, orgTopPlayers } from './vzp-org.js';
import { errEmbed } from './cmd-util.js';

const famOpt = (o) => o.setName('family').setDescription('Семья (например Cloud)').setRequired(true);

export const vzpCommandData = [
  new SlashCommandBuilder().setName('scout').setDescription('Разведотчёт по семье')
    .addStringOption(famOpt),
  new SlashCommandBuilder().setName('counter').setDescription('Контр-анализ: сильные/слабые стороны + рекомендации')
    .addStringOption(famOpt),
  new SlashCommandBuilder().setName('danger').setDescription('Самые опасные игроки семьи')
    .addStringOption(famOpt),
  new SlashCommandBuilder().setName('bestmap').setDescription('Лучшие и худшие карты семьи')
    .addStringOption(famOpt),
  new SlashCommandBuilder().setName('mapcompare').setDescription('Сравнение нас и врага по карте')
    .addStringOption(famOpt)
    .addStringOption((o) => o.setName('map').setDescription('Карта, напр. Мясо').setRequired(true)),
  new SlashCommandBuilder().setName('mvp').setDescription('Кандидаты в состав .aeterna по эффективности'),
].map((c) => c.toJSON());

export async function handleVzpCommand(interaction) {
  const c = interaction.commandName;
  if (c === 'scout') return scout(interaction);
  if (c === 'counter') return counter(interaction);
  if (c === 'danger') return danger(interaction);
  if (c === 'bestmap') return bestmap(interaction);
  if (c === 'mapcompare') return mapcompare(interaction);
  if (c === 'mvp') return mvp(interaction);
  return false; // не наша команда
}

const avgDmg = (p) => (p.eventsPlayed ? Math.round(p.damage / p.eventsPlayed) : 0);
const notFound = (i, n) => i.editReply({ embeds: [errEmbed(`Семья «${n}» не найдена в базе VZP.`)] });

async function scout(interaction) {
  await interaction.deferReply({ flags: 64 });
  const name = interaction.options.getString('family');
  const b = await orgBundle(name).catch(() => null);
  if (!b) return notFound(interaction, name);
  const o = b.overview;
  const maps = mapsFromHistory(b.history);
  const d7 = winrateWindow(b.history, 7), d30 = winrateWindow(b.history, 30);
  const best = maps.slice(0, 3).map((m) => `${m.name} ${m.wr}% (${m.games})`).join(', ') || '—';
  const worst = maps.slice(-3).reverse().map((m) => `${m.name} ${m.wr}% (${m.games})`).join(', ') || '—';
  const top = [...b.top].sort((a, z) => avgDmg(z) - avgDmg(a)).slice(0, 5)
    .map((p, i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${p.charName} — ${avgDmg(p)} урон, K/D ${p.kd}`).join('\n') || '—';
  const recent = b.history.slice(0, 7).map((h) => (h.isWin ? '✅' : '❌')).join(' ') || '—';

  const embed = new EmbedBuilder()
    .setTitle(`🔍 Разведка: ${o.name} (${o.serverName})`)
    .setColor(0xe67e22)
    .setDescription(
      `Винрейт: **${o.winrate}%** (${o.wins}-${o.losses}, всего ${o.totalEvents})\n` +
      `За 7 дней: **${d7.wr ?? '—'}%** (${d7.games}) • за 30 дней: **${d30.wr ?? '—'}%** (${d30.games})\n` +
      `Ранг: #${o.rankServer} сервер • серия: ${o.winStreak > 0 ? '🔥' + o.winStreak : o.lossStreak > 0 ? '❄️' + o.lossStreak : '—'}\n` +
      `Последние: ${recent}`
    )
    .addFields(
      { name: '✅ Лучшие карты', value: best, inline: false },
      { name: '❌ Худшие карты', value: worst, inline: false },
      { name: '💪 Сильнейшие игроки', value: top, inline: false },
    )
    .setFooter({ text: '.aeterna • разведка' });
  await interaction.editReply({ embeds: [embed] });
}

async function counter(interaction) {
  await interaction.deferReply({ flags: 64 });
  const name = interaction.options.getString('family');
  const b = await orgBundle(name).catch(() => null);
  if (!b) return notFound(interaction, name);
  const o = b.overview;
  const maps = mapsFromHistory(b.history);
  const top = [...b.top].sort((a, z) => avgDmg(z) - avgDmg(a));
  const teamDmg = top.length ? Math.round(top.slice(0, 5).reduce((s, p) => s + avgDmg(p), 0) / Math.min(5, top.length)) : 0;
  const strong = maps.filter((m) => m.games >= 2 && m.wr >= 60);
  const weak = maps.filter((m) => m.games >= 2 && m.wr <= 45);
  const star = top[0];
  const lowSurv = top.filter((p) => p.kd < 0.6 && p.eventsPlayed >= 3).slice(0, 2);

  const S = [], W = [], R = [];
  if (teamDmg >= 500) { S.push(`высокий средний урон (~${teamDmg})`); R.push('играть от укрытий/дистанции, не лезть в открытый размен'); }
  else { W.push(`невысокий средний урон (~${teamDmg})`); R.push('можно навязывать агрессивный темп'); }
  if (strong.length) { S.push(`сильные карты: ${strong.slice(0, 3).map((m) => m.name).join(', ')}`); R.push(`избегать/банить их карты: ${strong.slice(0, 2).map((m) => m.name).join(', ')}`); }
  if (weak.length) { W.push(`слабые карты: ${weak.slice(0, 3).map((m) => m.name).join(', ')}`); R.push(`навязывать карты: ${weak.slice(0, 2).map((m) => m.name).join(', ')}`); }
  if (star) { S.push(`ключевой игрок: ${star.charName} (${avgDmg(star)} урон, K/D ${star.kd})`); R.push(`фокусить ${star.charName} в начале боя`); }
  if (lowSurv.length) { W.push(`слабая выживаемость: ${lowSurv.map((p) => `${p.charName} (K/D ${p.kd})`).join(', ')}`); R.push('форсить размены — они легко умирают'); }
  if (o.winrate < 45) W.push(`общий низкий винрейт (${o.winrate}%)`);
  if (o.lossStreak >= 2) W.push(`серия поражений (${o.lossStreak})`);

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Контр-анализ: ${o.name}`)
    .setColor(0x9b59b6)
    .addFields(
      { name: '💪 Сильные стороны', value: S.map((x) => '• ' + x).join('\n') || '—', inline: false },
      { name: '🩸 Слабые стороны', value: W.map((x) => '• ' + x).join('\n') || '—', inline: false },
      { name: '🎯 Рекомендации', value: R.map((x) => '• ' + x).join('\n') || '—', inline: false },
    )
    .setFooter({ text: '.aeterna • контр-анализ (эвристика)' });
  await interaction.editReply({ embeds: [embed] });
}

async function danger(interaction) {
  await interaction.deferReply({ flags: 64 });
  const name = interaction.options.getString('family');
  const b = await orgBundle(name).catch(() => null);
  if (!b) return notFound(interaction, name);
  const top = [...b.top].sort((a, z) => avgDmg(z) - avgDmg(a)).slice(0, 8);
  const list = top.map((p, i) => `\`${String(i + 1).padStart(2)}\` **${p.charName}** — ${avgDmg(p)} ср.урон • K/D ${p.kd} • WR ${p.winrate}%`).join('\n') || '—';
  await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`☠️ Опасные игроки: ${b.overview.name}`).setColor(0xe74c3c).setDescription(list).setFooter({ text: '.aeterna' })] });
}

async function bestmap(interaction) {
  await interaction.deferReply({ flags: 64 });
  const name = interaction.options.getString('family');
  const b = await orgBundle(name).catch(() => null);
  if (!b) return notFound(interaction, name);
  const maps = mapsFromHistory(b.history);
  const best = maps.slice(0, 5).map((m, i) => `${i + 1}. ${m.name} — ${m.wr}% (${m.w}-${m.l})`).join('\n') || '—';
  const worst = maps.slice(-5).reverse().map((m, i) => `${i + 1}. ${m.name} — ${m.wr}% (${m.w}-${m.l})`).join('\n') || '—';
  await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`🗺️ Карты: ${b.overview.name}`).setColor(0x3498db)
    .addFields({ name: '✅ Лучшие', value: best, inline: true }, { name: '❌ Худшие', value: worst, inline: true })] });
}

async function mapcompare(interaction) {
  await interaction.deferReply({ flags: 64 });
  const name = interaction.options.getString('family');
  const mapQ = interaction.options.getString('map').toLowerCase();
  const them = await orgBundle(name).catch(() => null);
  if (!them) return notFound(interaction, name);
  const us = await orgBundle('.aeterna').catch(() => null);
  const onMap = (b) => {
    const m = mapsFromHistory(b.history).find((x) => x.name.toLowerCase().includes(mapQ));
    return m || { name: mapQ, wr: null, w: 0, l: 0, games: 0 };
  };
  const u = onMap(us), t = onMap(them);
  const row = (label, a, c) => `${label.padEnd(10)} ${String(a).padStart(7)} ${String(c).padStart(7)}`;
  const table = '```\n' +
    row('', 'Мы', 'Они') + '\n' +
    row('Винрейт', (u.wr ?? '—') + '%', (t.wr ?? '—') + '%') + '\n' +
    row('Игр', u.games, t.games) + '\n' +
    row('W-L', `${u.w}-${u.l}`, `${t.w}-${t.l}`) + '\n```';
  await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`📊 Сравнение на «${t.name}»: .aeterna vs ${them.overview.name}`).setColor(0xf1c40f).setDescription(table)] });
}

async function mvp(interaction) {
  await interaction.deferReply({ flags: 64 });
  const top = await orgTopPlayers(ourOrgId(), 15).catch(() => []);
  const scored = top.map((p) => ({ p, score: avgDmg(p) * (0.5 + p.kd) * (0.5 + (p.winrate || 0) / 100) }))
    .sort((a, z) => z.score - a.score).slice(0, 10);
  const list = scored.map((s, i) => `${['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``} **${s.p.charName}** — ${avgDmg(s.p)} урон • K/D ${s.p.kd} • WR ${s.p.winrate}% • ${s.p.eventsPlayed} игр`).join('\n') || '—';
  await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🏅 Кандидаты в состав (.aeterna)').setColor(0x2ecc71).setDescription(list).setFooter({ text: 'сортировка по эффективности' })] });
}
