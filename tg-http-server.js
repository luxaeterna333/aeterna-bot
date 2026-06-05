import http from 'http';
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { activeWars, warKey } from './war-store.js';
import { trackWarMessage } from './war-messages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

const mapFiles = {
  STABCITY: 'Байкерка.png', MIRROR_PARK: 'Миррор Парк.png',
  GHETTO_ANTS: 'Муравейник.png', WINDFARM: 'Ветряки.png',
  LS_CINEMA: 'Киностудия.png', SANDYSHORES: 'Сенди Шорс.png',
  PALETOBAY: 'Палето Бей.png', PB_LUMBER: 'Лесопилка.png',
  SS_CONSTRUCTION: 'Биз стройка.png', EL_RANCHO_SMALL_OILBASE: 'Малая нефть.png',
  PUERTA_DUMP: 'Мусорка.png', ELBURRO: 'Мясо.png',
  NICOLA_PLACE: 'Татушка.png', BANNING_ANGAR: 'Тупик Миррор.png',
};

export function startTgHttpServer(client) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/tg-event') {
      res.writeHead(404); res.end(); return;
    }
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        await handleTgEvent(client, data);
        res.writeHead(200); res.end('ok');
      } catch (e) {
        console.error('[tg-http] error:', e.message);
        res.writeHead(500); res.end(e.message);
      }
    });
  });
  server.on('error', (e) => {
    // напр. EADDRINUSE если старый инстанс ещё держит порт — не валим весь бот
    console.error(`[tg-http] не удалось занять порт ${PORT}: ${e.message}`);
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ TG HTTP сервер слушает порт ${PORT}`);
  });
}

async function handleTgEvent(client, data) {
  if (data.type !== 'war') return;

  const { family, server, opponent, point, time, format, side = 'АТАКА' } = data;

  const channel = await client.channels.fetch(process.env.VZP_CHANNEL_ID);

  const isDef = side === 'ДЕФ';
  const sideEmoji = isDef ? '🛡️' : '⚔️';
  const sideLabel = isDef ? 'ЗАЩИТА' : 'АТАКА';
  const sideColor = isDef ? 0x3498DB : 0xED4245;

  const embed = new EmbedBuilder()
    .setTitle(`${sideEmoji} ВЗП — ${sideLabel}`)
    .setColor(sideColor)
    .addFields(
      { name: '🆚 Против', value: opponent, inline: true },
      { name: '🗺️ Объект', value: point, inline: true },
      { name: '🖥️ Сервер', value: server, inline: true },
      { name: '⏰ Время', value: time, inline: true },
      { name: '⚔️ Формат', value: format || '—', inline: true },
    )
    .setFooter({ text: '.aeterna • TG Monitor' })
    .setTimestamp();

  const sent = await channel.send({ embeds: [embed] });
  // подстраховка: если сайт так и не свяжет это сообщение с eventId — удалится по таймауту
  trackWarMessage(`tg_${sent.id}`, channel.id, sent.id);

  // Сохраняем для сайт-монитора (добавит карту по времени+стороне, имена точек у ТГ и API не совпадают)
  const key = warKey(point, server);
  activeWars.set(key, {
    messageId: sent.id,
    channelId: channel.id,
    opponent, point, server,
    side,                 // сырое 'АТАКА' | 'ДЕФ' для сопоставления с API
    source: 'tg',
    createdAt: Date.now(),
    mapAdded: false,
  });

  console.log(`[tg] Уведомление: ${sideLabel} vs ${opponent} | ${point} | ${server}`);
}
