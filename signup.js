// UI записи на ВЗП: кнопки «Записаться» (тоггл) + «Коллер» + эмбед состава с лимитом.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { initSignup, toggleSignup, toggleCaller, getSignup } from './signup-store.js';

export function signupComponents(cap) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`signup_join_${cap}`).setLabel('✅ Записаться').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`signup_caller_${cap}`).setLabel('👑 Коллер').setStyle(ButtonStyle.Primary),
    ),
  ];
}

export function signupEmbed(state) {
  const cap = state.cap || 0;
  const going = state.list.slice(0, cap);
  const bench = state.list.slice(cap);
  const tag = (id) => (state.caller === id ? `👑 <@${id}>` : `<@${id}>`);
  const goingStr = going.length ? going.map((id, i) => `\`${i + 1}.\` ${tag(id)}`).join('\n') : '_пусто_';

  const e = new EmbedBuilder()
    .setTitle('📝 Запись на ВЗП')
    .setColor(0x2ecc71)
    .setDescription(
      `Объект: **${state.point || '—'}** • Формат: **${state.fmt || '—'}**\n` +
      `«Записаться» — встать в состав (повторно — выйти). «👑 Коллер» — взять роль коллера.`
    )
    .addFields(
      { name: `✅ Состав (${going.length}/${cap})`, value: goingStr, inline: false },
      { name: '👑 Коллер', value: state.caller ? `<@${state.caller}>` : '_не назначен_', inline: false },
    );
  if (bench.length) e.addFields({ name: `🪑 Запас (${bench.length})`, value: bench.map((id) => tag(id)).join('\n'), inline: false });
  return e;
}

export async function postSignup(channel, cap, point, fmt) {
  const tmp = { cap, point, fmt, list: [], caller: null };
  const msg = await channel.send({ embeds: [signupEmbed(tmp)], components: signupComponents(cap) });
  initSignup(msg.id, cap, point, fmt);
  return msg;
}

export async function handleSignupButton(interaction) {
  const parts = interaction.customId.split('_'); // signup, join|caller, cap
  const type = isNaN(parts[1]) ? parts[1] : 'join';
  const cap = parseInt(isNaN(parts[1]) ? parts[2] : parts[1], 10) || 0;
  const prev = getSignup(interaction.message.id);

  let state, hint, joinedNow = false;
  if (type === 'caller') {
    // Коллером может стать только игрок с ролью Caller
    const hasCaller = interaction.member?.roles?.cache?.some(
      (r) => r.id === process.env.CALLER_ROLE_ID || r.name.includes('| Caller'));
    if (!hasCaller) {
      await interaction.reply({ content: '❌ Коллером может стать только игрок с ролью **Caller**.', flags: 64 });
      return;
    }
    state = toggleCaller(interaction.message.id, cap, interaction.user.id);
    joinedNow = state.caller === interaction.user.id;
    hint = joinedNow ? '👑 Ты теперь коллер на эту ВЗП.' : '👑 Ты больше не коллер.';
  } else {
    state = toggleSignup(interaction.message.id, cap, interaction.user.id);
    const joined = state.list.includes(interaction.user.id);
    joinedNow = joined;
    const inReserve = joined && state.list.indexOf(interaction.user.id) >= cap;
    hint = joined ? (inReserve ? '🪑 Состав заполнен — ты в запасе. Нажми ещё раз, чтобы выйти.' : '✅ Ты записан. Нажми ещё раз, чтобы выйти.') : '➖ Ты вышел из состава.';
  }
  if (!state.point && prev?.point) { state.point = prev.point; state.fmt = prev.fmt; }
  await interaction.update({ embeds: [signupEmbed(state)], components: signupComponents(cap) });
  await interaction.followUp({ content: hint, flags: 64 });

  // Записался/стал коллером и сидит в войсе — перекидываем в боевой войс
  if (joinedNow) {
    const TARGET = process.env.VC_VOICE_CHANNEL_ID || '1509212571608154396';
    const vc = interaction.member?.voice?.channelId;
    if (vc && vc !== TARGET) {
      try { await interaction.member.voice.setChannel(TARGET); } catch (e) { console.error('[signup] move voice:', e.message); }
    }
  }
}
