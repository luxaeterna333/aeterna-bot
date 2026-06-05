// Клиент Wellflow AI Gateway (OpenAI-совместимый chat/completions).
import 'dotenv/config';

const BASE = process.env.WELLFLOW_BASE || 'https://api.wellflow.dev/v1';
const KEY = process.env.WELLFLOW_API_KEY;
const MODEL = process.env.WELLFLOW_MODEL;
export const HEAVY_MODEL = process.env.WELLFLOW_MODEL_HEAVY || MODEL;

export function aiEnabled() {
  return Boolean(KEY && MODEL && MODEL.trim());
}

// Возвращает текст ответа или null (если ИИ выключен / ошибка). model — переопределение модели.
export async function aiChat(messages, { maxTokens = 500, temperature = 0.4, model } = {}) {
  const useModel = (model || MODEL || '').trim();
  if (!KEY || !useModel) return null;
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: useModel, messages, max_tokens: maxTokens, temperature }),
    });
    if (!r.ok) {
      console.error('[ai] HTTP', r.status, (await r.text()).slice(0, 200));
      return null;
    }
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    console.error('[ai] error:', e.message);
    return null;
  }
}
