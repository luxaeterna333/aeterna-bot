import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch();

  // Используем hex-коды из диагностики для точного совпадения
  const renames = [
    // ɢᴜᴇsᴛʀᴏᴏᴍ
    { hex: 'c9a2e1b49ce1b48773e1b49bca80e1b48fe1b48fe1b48d', newName: '🎙️・ɢᴜᴇsᴛʀᴏᴏᴍ' },
  ];

  for (const { hex, newName } of renames) {
    const target = Buffer.from(hex, 'hex').toString('utf8');
    const ch = guild.channels.cache.find(c => c.name === target);
    if (ch) {
      try {
        await ch.setName(newName);
        console.log('OK: ' + target + ' -> ' + newName);
      } catch(e) { console.log('ERR: ' + e.message); }
    } else {
      console.log('NOT FOUND: ' + target);
    }
  }

  console.log('Done');
  process.exit(0);
});

client.login(process.env.TOKEN);
