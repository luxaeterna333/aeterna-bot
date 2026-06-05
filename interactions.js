import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { handleCommand } from './commands.js';
import { handleSignupButton } from './signup.js';

// Временное хранилище данных первой части анкеты
const pendingApplications = new Map();

// Кулдаун на подачу заявки (userId -> timestamp последней подачи)
const cooldowns = new Map();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 час

export async function handleInteraction(interaction, client) {

  // --- Слэш-команды аналитики ---
  if (interaction.isChatInputCommand()) {
    return handleCommand(interaction);
  }

  // --- Запись на ВЗП ---
  if (interaction.isButton() && interaction.customId.startsWith('signup_')) {
    return handleSignupButton(interaction);
  }

  // --- Кнопка "Подать заявку" ---
  if (interaction.isButton() && interaction.customId === 'open_form') {
    const last = cooldowns.get(interaction.user.id);
    if (last && Date.now() - last < COOLDOWN_MS) {
      const remaining = COOLDOWN_MS - (Date.now() - last);
      const min = Math.ceil(remaining / 60000);
      await interaction.reply({
        content: `⏳ Ты уже подавал заявку недавно. Попробуй снова через **${min} мин.**`,
        flags: 64,
      });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId('application_modal')
      .setTitle('Анкета вступления — часть 1/2');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('nick_ic').setLabel('1. Ваш ник (IC)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: Ivan Petrov')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name_ooc').setLabel('2. Ваше имя (OOC)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: Иван')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('age').setLabel('3. Реальный возраст').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 18')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('law_knowledge').setLabel('4. Знание законодательной базы (0-10)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 8')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('hours').setLabel('5. Кол-во часов (gta5rp.com/user/stats)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 1200')
      ),
    );

    await interaction.showModal(modal);
    return;
  }

  // --- Сабмит первой части ---
  if (interaction.isModalSubmit() && interaction.customId === 'application_modal') {
    pendingApplications.set(interaction.user.id, {
      nickIC: interaction.fields.getTextInputValue('nick_ic'),
      nameOOC: interaction.fields.getTextInputValue('name_ooc'),
      age: interaction.fields.getTextInputValue('age'),
      lawKnowledge: interaction.fields.getTextInputValue('law_knowledge'),
      hours: interaction.fields.getTextInputValue('hours'),
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('continue_form')
        .setLabel('➡️ Продолжить (часть 2)')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({
      content: '✅ Первая часть принята! Нажми кнопку ниже чтобы заполнить вторую часть.',
      components: [row],
      flags: 64,
    });
    return;
  }

  // --- Кнопка "Продолжить" ---
  if (interaction.isButton() && interaction.customId === 'continue_form') {
    const modal = new ModalBuilder()
      .setCustomId('application_modal2')
      .setTitle('Анкета вступления — часть 2/2');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('understanding').setLabel('6. Понимание игры (0-10)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 9')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('recoil').setLabel('7. Откат стрельбы (ссылка с ютуба)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ссылка')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('why').setLabel('8. Почему выбрали .aeterna?').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Расскажи почему именно мы...')
      ),
    );

    await interaction.showModal(modal);
    return;
  }

  // --- Сабмит второй части ---
  if (interaction.isModalSubmit() && interaction.customId === 'application_modal2') {
    const part1 = pendingApplications.get(interaction.user.id);
    if (!part1) {
      await interaction.reply({ content: '❌ Сессия истекла, начни заново.', flags: 64 });
      return;
    }
    pendingApplications.delete(interaction.user.id);
    cooldowns.set(interaction.user.id, Date.now());

    const understanding = interaction.fields.getTextInputValue('understanding');
    const recoil = interaction.fields.getTextInputValue('recoil');
    const why = interaction.fields.getTextInputValue('why');

    await interaction.reply({ content: '✅ Заявка отправлена на рассмотрение! Ожидай решения руководства.', flags: 64 });

    const guild = interaction.guild;
    const reviewChannel = await guild.channels.fetch(process.env.REVIEW_CHANNEL_ID);

    // Собрать пинги одобряющих ролей
    await guild.roles.fetch();
    const approverNames = ['| Owner', '| High Deputy Owner', '| Deputy Owner', '| Head VZP'];
    const mentions = guild.roles.cache
      .filter(r => approverNames.some(name => r.name.includes(name)))
      .map(r => `<@&${r.id}>`)
      .join(' ');

    const embed = new EmbedBuilder()
      .setTitle('📬 Новая заявка на вступление')
      .setColor(0xFFA500)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '👤 Discord', value: `${interaction.user} (${interaction.user.tag})` },
        { name: '🎮 Ник (IC)', value: part1.nickIC },
        { name: '📛 Имя (OOC)', value: part1.nameOOC },
        { name: '🎂 Возраст', value: part1.age },
        { name: '⚖️ Знание законов', value: part1.lawKnowledge },
        { name: '⏱️ Часов на сервере', value: part1.hours },
        { name: '🧠 Понимание игры', value: understanding },
        { name: '🎯 Откат стрельбы', value: recoil },
        { name: '❓ Почему .aeterna?', value: why },
      )
      .setFooter({ text: `ID: ${interaction.user.id}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`approve_${interaction.user.id}`).setLabel('✅ Одобрить').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('❌ Отклонить').setStyle(ButtonStyle.Danger),
    );

    await reviewChannel.send({ content: mentions, embeds: [embed], components: [row] });
    return;
  }

  // --- Одобрить ---
  if (interaction.isButton() && interaction.customId.startsWith('approve_')) {
    if (!hasApproverRole(interaction.member)) {
      await interaction.reply({ content: '❌ У тебя нет прав для этого действия.', flags: 64 });
      return;
    }

    const targetId = interaction.customId.replace('approve_', '');
    const guild = interaction.guild;

    try {
      const member = await guild.members.fetch(targetId);
      const academyRole = await guild.roles.fetch(process.env.ACADEMY_ROLE_ID);
      console.log(`[approve] member=${member?.user?.tag} role=${academyRole?.name} roleId=${process.env.ACADEMY_ROLE_ID}`);
      await member.roles.add(academyRole);

      try {
        await member.send(`✅ **Поздравляем!** Твоя заявка в семью **.aeterna** одобрена!\nТебе выдана роль **${academyRole.name}**. Добро пожаловать в семью.`);
      } catch {}

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x57F287)
        .setTitle('✅ Заявка одобрена')
        .addFields({ name: '_ _', value: `# ✅ Одобрил: ${interaction.user.displayName}`, inline: false })
        .setFooter({ text: `Одобрил: ${interaction.user.tag}` });

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_${targetId}`).setLabel('✅ Одобрено').setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId(`reject_${targetId}`).setLabel('❌ Отклонить').setStyle(ButtonStyle.Danger).setDisabled(true),
      );

      await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
      await interaction.followUp({ content: `✅ ${member} принят в семью и получил роль **${academyRole.name}**!`, flags: 64 });
    } catch (e) {
      console.error('[approve error]', e);
      await interaction.reply({ content: `❌ Ошибка: ${e.message}`, flags: 64 });
    }
    return;
  }

  // --- Отклонить ---
  if (interaction.isButton() && interaction.customId.startsWith('reject_')) {
    if (!hasApproverRole(interaction.member)) {
      await interaction.reply({ content: '❌ У тебя нет прав для этого действия.', flags: 64 });
      return;
    }

    const targetId = interaction.customId.replace('reject_', '');

    try {
      const guild = interaction.guild;
      const member = await guild.members.fetch(targetId);
      await member.send(`❌ К сожалению, твоя заявка в семью **.aeterna** была отклонена пользователем **${interaction.user.displayName}**. Ты можешь попробовать снова позже.`);
    } catch {}

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0xED4245)
      .setTitle('❌ Заявка отклонена')
      .addFields({ name: '_ _', value: `# ❌ Отклонил: ${interaction.user.displayName}`, inline: false })
      .setFooter({ text: `Отклонил: ${interaction.user.tag}` });

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`approve_${targetId}`).setLabel('✅ Одобрить').setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId(`reject_${targetId}`).setLabel('❌ Отклонено').setStyle(ButtonStyle.Danger).setDisabled(true),
    );

    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
    await interaction.followUp({ content: '❌ Заявка отклонена.', flags: 64 });
    return;
  }
}

function hasApproverRole(member) {
  const approverNames = ['| Owner', '| High Deputy Owner', '| Deputy Owner', '| Head VZP'];
  return member.roles.cache.some(role =>
    approverNames.some(name => role.name.includes(name))
  );
}
