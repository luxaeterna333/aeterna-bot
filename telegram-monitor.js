import 'dotenv/config';
import { EmbedBuilder } from 'discord.js';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { activeWars, warKey } from './war-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionFile = path.join(__dirname, 'telegram_session.txt');

const processedMessages = new Set();

export async function startTelegramMonitor(discordClient) {
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  let sessionString = '';
  if (fs.existsSync(sessionFile)) {
    sessionString = fs.readFileSync(sessionFile, 'utf-8').trim();
  }

  const session = new StringSession(sessionString);
  const tgOptions = {
    connectionRetries: 5,
    autoReconnect: true,
  };
  if (process.env.TG_PROXY_IP) {
    tgOptions.proxy = {
      ip: process.env.TG_PROXY_IP,
      port: parseInt(process.env.TG_PROXY_PORT),
      socksType: 5,
    };
  }
  const client = new TelegramClient(session, apiId, apiHash, tgOptions);

  await client.start({
    phoneNumber: async () => {
      console.log('\n📱 Введи номер телефона (например +79998887766):');
      return await input.text('Номер: ');
    },
    password: async () => {
      console.log('🔐 Пароль 2FA (если нет — Enter):');
      return await input.text('Пароль: ');
    },
    phoneCode: async () => {
      console.log('📬 Код из Telegram:');
      return await input.text('Код: ');
    },
    onError: (err) => console.error('[TG error]', err),
  });

  fs.writeFileSync(sessionFile, client.session.save(), 'utf-8');
  console.log('✅ Telegram подключен');

  client.addEventHandler(async (event) => {
    try {
      await handleMessage(event, discordClient);
    } catch (e) {
      console.error('[TG handle error]', e.message);
    }
  });
}

async function handleMessage(event, discordClient) {
  const msg = event.message;
  if (!msg || !msg.message) return;

  const text = msg.message;

  // Фильтр: только уведомления о войне нашей организации
  if (!text.includes('Организация:') || !text.toLowerCase().includes('забил')) return;

  const msgId = String(msg.id);
  if (processedMessages.has(msgId)) return;
  processedMessages.add(msgId);

  // Парсинг: "Организация: события | Lux_Aeterna, сервер Rockford"
  const orgMatch = text.match(/Организация:.*?\|\s*(.+?),\s*сервер\s+(\S+)/i);
  // Парсинг: "забила REINHARD войну за Ломбард Strawberry на 21:48, 8х8"
  const warMatch = text.match(/забил[аи]?\s+(.+?)\s+войну за\s+(.+?)\s+на\s+(\d{1,2}:\d{2})/i);

  if (!orgMatch || !warMatch) {
    console.log('[TG] Сообщение не распознано:', text.slice(0, 80));
    return;
  }

  const family = orgMatch[1].trim();
  const server = orgMatch[2].trim();
  const opponent = warMatch[1].trim();
  const point = warMatch[2].trim();
  const time = warMatch[3].trim();

  // Формат боя: "8х8"
  const formatMatch = text.match(/(\d+х\d+|\d+x\d+)/i);
  const format = formatMatch ? formatMatch[1] : '—';

  const side = 'АТАКА'; // "забили войну" = мы атакуем
  const sideEmoji = '⚔️';
  const sideColor = 0xED4245;

  const channel = await discordClient.channels.fetch(process.env.VZP_CHANNEL_ID);
  const guild = channel.guild;
  await guild.roles.fetch();
  const vzpRole = guild.roles.cache.find(r => r.name.includes('| VZP'));
  const mention = vzpRole ? `<@&${vzpRole.id}>` : '';

  const embed = new EmbedBuilder()
    .setTitle(`${sideEmoji} ВЗП — ${side}`)
    .setColor(sideColor)
    .addFields(
      { name: '🆚 Против', value: opponent, inline: true },
      { name: '🗺️ Объект', value: point, inline: true },
      { name: '🖥️ Сервер', value: server, inline: true },
      { name: '⏰ Время', value: time, inline: true },
      { name: '⚔️ Формат', value: format, inline: true },
    )
    .setFooter({ text: '.aeterna • VZP Monitor' })
    .setTimestamp();

  const sent = await channel.send({ content: mention, embeds: [embed] });
  await sent.react('➕');

  // Сохраняем для дальнейшего обогащения с сайта
  const key = warKey(point, server);
  activeWars.set(key, {
    messageId: sent.id,
    channelId: channel.id,
    opponent,
    point,
    server,
    time,
    format,
    side,
    mapAdded: false,
    finished: false,
    createdAt: Date.now(),
  });

  console.log(`[TG] ВЗП создан: ${side} vs ${opponent} | ${point} | ${server} | ${time}`);
}
