import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  // Берём реальное событие с сайта
  const res = await fetch('https://vzp-gta5rp.com/api/events?limit=30&offset=0', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  const events = await res.json();
  const ev = events[0]; // первое (самое свежее)

  const channel = await client.channels.fetch(process.env.VZP_CHANNEL_ID);
  const guild = channel.guild;
  await guild.roles.fetch();
  const vzpRole = guild.roles.cache.find(r => r.name.includes('| VZP'));
  const mention = vzpRole ? `<@&${vzpRole.id}>` : '(роль VZP не найдена)';

  // Для теста считаем что мы атакуем
  const side = 'АТАКА';
  const sideEmoji = '⚔️';
  const opponent = ev.defenderName;

  const embed = new EmbedBuilder()
    .setTitle(`${sideEmoji} ВЗП — ${side}  [ТЕСТ]`)
    .setColor(0xED4245)
    .setDescription('*Это тестовое уведомление. Данные взяты из реального ВЗП другой семьи.*')
    .addFields(
      { name: '🎯 Тип', value: 'Мы атакуем ⚔️', inline: true },
      { name: '🆚 Против', value: opponent || '—', inline: true },
      { name: '🗺️ Объект', value: ev.pointName || '—', inline: true },
      { name: '🖥️ Сервер', value: ev.serverName || '—', inline: true },
      { name: '👥 Игроков', value: String(ev.maxPlayers ?? '—'), inline: true },
    )
    .setFooter({ text: '.aeterna • VZP Monitor' })
    .setTimestamp(new Date(ev.startedAt));

  await channel.send({ content: mention, embeds: [embed] });
  console.log(`OK: тест отправлен (против ${opponent} на ${ev.serverName})`);
  process.exit(0);
});

client.login(process.env.TOKEN);
