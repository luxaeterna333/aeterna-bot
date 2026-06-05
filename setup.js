import { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');

function updateEnv(key, value) {
  let content = fs.readFileSync(envPath, 'utf-8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(envPath, content);
  process.env[key] = value;
}

export async function setupServer(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch();
  await guild.roles.fetch();

  // --- Роль Academy ---
  let academyRole = guild.roles.cache.find(r => r.name === '▸ | Academy');
  if (!academyRole) {
    academyRole = await guild.roles.create({
      name: '▸ | Academy',
      color: 0x5865F2,
      reason: 'Авто-создание роли Academy',
    });
    console.log(`✅ Роль создана: ${academyRole.name}`);
  }
  updateEnv('ACADEMY_ROLE_ID', academyRole.id);

  // --- Роль Caller (только она может брать роль коллера при записи) ---
  let callerRole = guild.roles.cache.find(r => r.name === '▸ | Caller');
  if (!callerRole) {
    callerRole = await guild.roles.create({
      name: '▸ | Caller',
      color: 0xF1C40F,
      hoist: true,
      reason: 'Авто-создание роли Caller',
    });
    console.log(`✅ Роль создана: ${callerRole.name}`);
  }
  updateEnv('CALLER_ROLE_ID', callerRole.id);

  // --- Копируем права с роли MAIN на Academy ---
  const mainRole = guild.roles.cache.find(r => r.name === '▸ | MAIN');
  if (mainRole) {
    // Для каждого канала — если MAIN имеет allow/deny, выставляем то же для Academy
    for (const channel of guild.channels.cache.values()) {
      const mainOverwrite = channel.permissionOverwrites?.cache?.get(mainRole.id);
      if (mainOverwrite) {
        try {
          await channel.permissionOverwrites.edit(academyRole.id, {
            ...Object.fromEntries(
              [...mainOverwrite.allow].map(p => [p, true])
            ),
            ...Object.fromEntries(
              [...mainOverwrite.deny].map(p => [p, false])
            ),
          });
        } catch {}
      }
    }
    console.log('✅ Права Academy скопированы с MAIN');
  } else {
    console.log('⚠️ Роль MAIN не найдена');
  }

  // --- Переименовать каналы вступления если старые названия ---
  const oldCategory = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === '▸ | ВСТУПЛЕНИЕ'
  );
  if (oldCategory) {
    await oldCategory.setName('▸ | RECRUITMENT');
    console.log('✅ Категория переименована');
  }
  const oldApply = guild.channels.cache.find(c => c.name === '📝・подать-заявку');
  if (oldApply) {
    await oldApply.setName('📝・apply');
    console.log('✅ Канал переименован: apply');
  }
  const oldReview = guild.channels.cache.find(c => c.name === '📬・заявки');
  if (oldReview) {
    await oldReview.setName('📬・applications');
    console.log('✅ Канал переименован: applications');
  }

  // --- Смайлики для каналов ---
  const emojiMap = {
    'ɴᴇᴡs':             '📢・ɴᴇᴡs',
    'ʀᴜʟᴇs':            '📜・ʀᴜʟᴇs',
    'ᴄʜᴀᴛ-ғᴏʀ-ɢᴜᴇsᴛs':  '👋・ᴄʜᴀᴛ-ғᴏʀ-ɢᴜᴇsᴛs',
    'ɢɪᴠɪɴɢ-ᴏᴜᴛ-ʀᴏʟᴇs': '🎭・ɢɪᴠɪɴɢ-ᴏᴜᴛ-ʀᴏʟᴇs',
    'ᴠᴏɪᴄᴇ-ɪɴᴛᴇʀғᴀᴄᴇ':  '🔊・ᴠᴏɪᴄᴇ-ɪɴᴛᴇʀғᴀᴄᴇ',
    'ғᴀᴍɪʟʏ-ᴄʜᴀᴛ':      '🩸・ғᴀᴍɪʟʏ-ᴄʜᴀᴛ',
    'ᴘᴜʙʟɪᴄ-ᴄʜᴀᴛ':      '💬・ᴘᴜʙʟɪᴄ-ᴄʜᴀᴛ',
    'ᴍᴀᴘs':             '🗺️・ᴍᴀᴘs',
    'ᴘʟᴜsᴇs-and-ᴄʜᴀᴛ':  '➕・ᴘʟᴜsᴇs-and-ᴄʜᴀᴛ',
    'ᴅʀᴇss-ᴄᴏᴅᴇ':       '👔・ᴅʀᴇss-ᴄᴏᴅᴇ',
    'sᴛᴀᴛɪsᴛɪᴄs':       '📊・sᴛᴀᴛɪsᴛɪᴄs',
  };

  for (const [exactName, newName] of Object.entries(emojiMap)) {
    const ch = guild.channels.cache.find(c => c.name === exactName);
    if (ch) {
      try {
        await ch.setName(newName);
        console.log(`✅ Переименован: ${exactName} → ${newName}`);
      } catch (e) {
        console.error(`❌ Не удалось переименовать ${exactName}:`, e.message);
      }
    } else {
      console.log(`⚠️ Канал не найден: ${exactName}`);
    }
  }

  const approverRoleNames = ['| Owner', '| High Deputy Owner', '| Deputy Owner', '| Head VZP'];
  const approverRoles = guild.roles.cache.filter(r =>
    approverRoleNames.some(name => r.name.includes(name))
  );

  // --- Найти категорию (уже переименована или новая) ---
  let category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === '▸ | RECRUITMENT'
  );
  if (!category) {
    category = await guild.channels.create({
      name: '▸ | RECRUITMENT',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...approverRoles.map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] })),
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    console.log('✅ Категория создана: RECRUITMENT');
  }

  // --- Канал apply ---
  let applyChannel = guild.channels.cache.find(
    c => c.name === '📝・apply' && c.parentId === category.id
  );
  if (!applyChannel) {
    applyChannel = await guild.channels.create({
      name: '📝・apply',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    console.log('✅ Канал создан: apply');
    await sendApplyMessage(applyChannel);
  } else {
    const messages = await applyChannel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id);
    if (!botMsg) {
      await sendApplyMessage(applyChannel);
      console.log('✅ Сообщение в apply создано');
    } else {
      console.log('✅ Сообщение в apply уже существует');
    }
  }
  updateEnv('APPLICATION_CHANNEL_ID', applyChannel.id);

  // --- Канал applications ---
  let reviewChannel = guild.channels.cache.find(
    c => c.name === '📬・applications' && c.parentId === category.id
  );
  if (!reviewChannel) {
    reviewChannel = await guild.channels.create({
      name: '📬・applications',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...approverRoles.map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    console.log('✅ Канал создан: applications');
  }
  updateEnv('REVIEW_CHANNEL_ID', reviewChannel.id);

  // --- Канал разведки ВЗП (отдельно от основного, чтобы не засорять) ---
  try {
    const vzpChannel = await guild.channels.fetch(process.env.VZP_CHANNEL_ID).catch(() => null);
    // 1) по сохранённому id  2) по имени (новое или старое)  3) создаём с новым именем
    let scoutCh = null;
    if (process.env.VZP_ANALYTICS_CHANNEL_ID) {
      scoutCh = await guild.channels.fetch(process.env.VZP_ANALYTICS_CHANNEL_ID).catch(() => null);
    }
    if (!scoutCh) scoutCh = guild.channels.cache.find((c) => c.name === '🔍・recon-vzp' || c.name === '🔍・разведка-взп');
    if (!scoutCh && vzpChannel) {
      scoutCh = await guild.channels.create({
        name: '🔍・recon-vzp',
        type: ChannelType.GuildText,
        parent: vzpChannel.parentId || undefined,
        permissionOverwrites: vzpChannel.permissionOverwrites.cache.map((o) => ({
          id: o.id, allow: o.allow.toArray(), deny: o.deny.toArray(),
        })),
      });
      console.log('✅ Канал создан: recon-vzp');
    }
    if (scoutCh) updateEnv('VZP_ANALYTICS_CHANNEL_ID', scoutCh.id);
  } catch (e) {
    console.error('⚠️ Канал разведки:', e.message);
  }

  console.log('✅ Сервер настроен успешно');
}

function buildApplyEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🩸 .aeterna — Семья, которая живёт в тени закона')
    .setDescription(
      '**.aeterna** — это сплочённая семья на сервере Rockford, чьё влияние давно вышло за рамки улиц. ' +
      'Мы специализируемся на **ВЗП**, при этом умело работая внутри **государственных структур**. ' +
      'Если ты умеешь постоять за себя как в перестрелке, так и в перепалке с прокурором — тебе к нам.\n\n' +
      '**Чем мы занимаемся:**\n' +
      '🏛️ Активная работа в госструктурах — суды, политика, влияние изнутри\n' +
      '🔫 ВЗП — контроль территорий, битва за них\n' +
      '🤝 Семейные связи — взаимовыручка, доверие, общие интересы\n' +
      '📋 Строгая иерархия — каждый знает своё место и ценится\n\n' +
      '**Мы ищем тех, кто:**\n' +
      '— Умеет держать язык за зубами\n' +
      '— Знает что такое лояльность\n' +
      '— Готов развиваться и расти внутри семьи\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━\n' +
      '📌 Заполни анкету ниже. Руководство рассмотрит заявку и свяжется с тобой.\n' +
      '⚠️ *Неполные или несерьёзные анкеты отклоняются без объяснений.*'
    )
    .setColor(0x2B2D31)
    .setImage('attachment://banner.jpg')
    .setFooter({ text: '.aeterna family • GTA V RP' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('📝 Подать заявку')
      .setStyle(ButtonStyle.Danger)
      .setCustomId('open_form')
  );

  return { embed, row };
}

async function sendApplyMessage(channel) {
  const { embed, row } = buildApplyEmbed();
  const banner = new AttachmentBuilder(path.join(__dirname, 'banner.jpg'));
  await channel.send({ embeds: [embed], components: [row], files: [banner] });
}
