import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { setupServer } from './setup.js';
import { handleInteraction } from './interactions.js';
import { startVzpMonitor } from './vzp-monitor.js';
import { startTgHttpServer } from './tg-http-server.js';
import { commandData } from './commands.js';
import { startWarMessageSweep } from './war-messages.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.once('ready', async () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
  try { await setupServer(client); } catch (e) { console.error('⚠️ setupServer:', e.message); }
  try { startVzpMonitor(client); } catch (e) { console.error('⚠️ vzpMonitor:', e.message); }
  try { startTgHttpServer(client); } catch (e) { console.error('⚠️ tgHttp:', e.message); }
  try { startWarMessageSweep(client, [process.env.VZP_CHANNEL_ID, process.env.VZP_ANALYTICS_CHANNEL_ID]); } catch (e) { console.error('⚠️ sweep:', e.message); }
  // Статистику НЕ обновляем на старте — только после ВЗП (см. vzp-monitor sendResult)

  // Регистрируем слэш-команды в гильдии (мгновенно доступны)
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.commands.set(commandData);
    console.log(`✅ Слэш-команды зарегистрированы (${commandData.length})`);
  } catch (e) {
    console.error('⚠️ Не удалось зарегистрировать слэш-команды:', e.message,
      '\n   (бота нужно пригласить со scope applications.commands)');
  }
});

client.on('interactionCreate', async (interaction) => {
  console.log(`[interaction] type=${interaction.type} customId=${interaction.customId ?? 'n/a'}`);
  try {
    await handleInteraction(interaction, client);
  } catch (e) {
    console.error('[interaction error]', e);
  }
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

client.login(process.env.TOKEN);
