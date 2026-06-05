import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch();

  // Печатаем все имена каналов с hex-кодами для диагностики
  for (const ch of guild.channels.cache.values()) {
    const hex = Buffer.from(ch.name, 'utf8').toString('hex');
    console.log(`NAME: ${ch.name} | HEX: ${hex}`);
  }
  process.exit(0);
});

client.login(process.env.TOKEN);
