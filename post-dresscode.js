// Постинг/обновление дресс-кода. Картинку берёт из dresscode.png/jpg в папке проекта (если есть).
import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import fs from 'fs';
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(process.env.TOKEN);
await new Promise(r => client.once('ready', r));
const guild = await client.guilds.fetch(process.env.GUILD_ID);
await guild.channels.fetch();
const ch = guild.channels.cache.find(c => c.isTextBased?.() && (c.name.includes('👔') || c.name.includes('ᴅʀᴇss') || c.name.toLowerCase().includes('dress')));
if (!ch) { console.log('dress-code channel not found'); await client.destroy(); process.exit(1); }
const msgs = await ch.messages.fetch({ limit: 50 }).catch(()=>null);
if (msgs) for (const m of msgs.values()) if (m.author.id === client.user.id) await m.delete().catch(()=>{});
const embed = new EmbedBuilder()
  .setTitle('👔 ДРЕСС-КОД  •  .aeterna')
  .setColor(0xC0392B)
  .setDescription('Обязательная форма для всех участников семьи.\nЕдиный вид — лицо **.aeterna**. Без отклонений.')
  .addFields(
    { name: '👕 Верх', value: 'Футболка «Автолюбитель»  **( 7 )**' },
    { name: '👖 Низ', value: 'Джинсы «Хулиганы»  **( 5 )**' },
  )
  .setFooter({ text: '.aeterna family • форма обязательна' });
const imgFile = ['dress-code.png','dresscode.png','dress-code.jpg','dresscode.jpg','dresscode.jpeg'].find(f => fs.existsSync(f));
const opts = { embeds: [embed] };
if (imgFile) { embed.setImage(`attachment://${imgFile}`); opts.files = [new AttachmentBuilder(imgFile)]; }
await ch.send(opts);
console.log(imgFile ? 'posted WITH '+imgFile : 'posted (no image)');
await client.destroy(); process.exit(0);
