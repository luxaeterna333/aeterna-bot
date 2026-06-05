import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.roles.fetch();
  await guild.members.fetch(client.user.id);

  const botMember = await guild.members.fetch(client.user.id);
  const botRole = botMember.roles.highest;
  const academyRole = await guild.roles.fetch(process.env.ACADEMY_ROLE_ID);

  console.log(`Бот высшая роль: ${botRole.name} (pos ${botRole.position})`);
  console.log(`Academy: ${academyRole.name} (pos ${academyRole.position})`);

  // Поднять роль Academy ниже роли бота, но проверим что роль бота выше
  if (botRole.position <= academyRole.position) {
    // Поставить Academy на позицию на 1 ниже роли бота
    try {
      await academyRole.setPosition(botRole.position - 1);
      console.log(`✅ Academy перемещена ниже роли бота`);
    } catch (e) {
      console.log(`❌ Не удалось переместить: ${e.message}`);
    }
  } else {
    console.log('✅ Иерархия уже корректна');
  }

  process.exit(0);
});

client.login(process.env.TOKEN);
