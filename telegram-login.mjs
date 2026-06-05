import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionFile = path.join(__dirname, "telegram_session.txt");
const apiId = parseInt(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;
console.log("=== ??????????? Telegram ===");
const session = new StringSession("");
const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
  proxy: { ip: "127.0.0.1", port: 8443, MTProxy: true, secret: process.env.TG_PROXY_SECRET || "" },
});
await client.start({
  phoneNumber: async () => await input.text("????? ???????? (+7...): "),
  password: async () => await input.text("?????? 2FA (Enter ???? ???): "),
  phoneCode: async () => {
    console.log("??????? AyuGram ?? ?? ? Telegram ?? ????????!");
    return await input.text("???: ");
  },
  onError: (err) => console.error("??????:", err),
});
const saved = client.session.save();
fs.writeFileSync(sessionFile, saved, "utf-8");
console.log("??????! ?????? ?????????.");
process.exit(0);
