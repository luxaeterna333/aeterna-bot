// Общее хранилище активных ВЗП (связь Telegram <-> сайт)
// key: нормализованный ключ (объект+сервер) -> { messageId, channelId, opponent, point, server, side, mapAdded, finished }

export const activeWars = new Map();

// Нормализация для сопоставления ТГ и сайта
export function warKey(point, server) {
  return `${(point || '').toLowerCase().trim()}__${(server || '').toLowerCase().trim()}`;
}
