# aeterna-bot

Discord + Telegram бот для GTA V roleplay сервера **.aeterna**.

## Возможности

- **VZP (ВЗП) войны** — мониторинг и уведомления о ганг-варах в реальном времени: полинг событий, карты зон с аннотациями (атака/защита), таблицы результатов
- **Запись в клан** — система заявок через Discord: форма анкеты, хранение, уведомления офицеров
- **Дресс-код** — публикация изображений дресс-кода фракции
- **Карты зон** — генерация и публикация карт VZP-территорий с отметками
- **Ростер** — статистика участников, управление составом
- **Telegram-мониторинг** — отслеживание событий через Telegram (MTCute / Telethon)
- **AI-позиции** — интеграция с Claude API для анализа тактических позиций

## Стек

- **Node.js** (ESM модули)
- **discord.js v14** — Discord Bot API
- **MTCute** + **telegram** — Telegram клиенты
- **Python** (вспомогательные скрипты: аннотация карт, Telethon)
- **dotenv** — конфигурация

## Структура

```
aeterna-bot/
├── index.js               # Точка входа Discord бота
├── commands.js            # Slash-команды
├── commands-vzp.js        # Команды VZP войн
├── commands-roster.js     # Команды ростера
├── interactions.js        # Обработка интеракций
├── vzp-monitor.js         # Мониторинг VZP событий (полинг)
├── war-messages.js        # Сообщения о варах
├── war-store.js           # Хранилище состояния варов
├── signup.js              # Система заявок в клан
├── signup-store.js        # Хранилище заявок
├── maps.js                # Работа с картами зон
├── mapgen.js              # Генерация карт
├── scouting.js            # Скаутинг позиций
├── ai.js                  # Claude AI интеграция
├── ai-positions.js        # AI-анализ позиций
├── stats.js               # Статистика
├── telegram-monitor.js    # Telegram-мониторинг (Node)
├── tg-http-server.js      # HTTP-сервер для TG событий
├── annotate_maps.py       # Аннотация карт (Python/PIL)
└── telegram-monitor.py    # Telegram-мониторинг (Telethon)
```

## Быстрый старт

```bash
git clone https://github.com/luxaeterna333/aeterna-bot.git
cd aeterna-bot

npm install

cp .env.example .env
# Заполнить DISCORD_TOKEN, GUILD_ID, API_KEY и другие переменные

node index.js
```

## Конфигурация (.env)

| Переменная | Описание |
|---|---|
| `DISCORD_TOKEN` | Токен Discord бота |
| `GUILD_ID` | ID сервера Discord |
| `API_KEY` | Ключ Claude API |
| `TG_API_ID` | Telegram API ID |
| `TG_API_HASH` | Telegram API Hash |

## Лицензия

MIT
