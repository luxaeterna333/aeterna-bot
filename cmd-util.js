// Общие хелперы для слэш-команд: скрытый ответ (ephemeral) + единый стиль эмбедов.
import { EmbedBuilder } from 'discord.js';

export const HIDDEN = { flags: 64 }; // ephemeral

export const errEmbed = (text) => new EmbedBuilder().setColor(0xe74c3c).setDescription(`❌ ${text}`);
export const infoEmbed = (text) => new EmbedBuilder().setColor(0x95a5a6).setDescription(text);

// Дефер в скрытом режиме
export const deferHidden = (i) => i.deferReply({ flags: 64 });

// Ответ ошибкой в едином стиле
export const replyErr = (i, text) => i.editReply({ embeds: [errEmbed(text)] });
