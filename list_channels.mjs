import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch();
  const names = guild.channels.cache.map(c => c.name).sort().join('\n');
  console.log(names);
  process.exit(0);
});
client.login(process.env.TOKEN);
