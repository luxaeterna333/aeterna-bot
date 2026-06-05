// Генерация карты под формат NxN (>5) — спавнит map-extra.py (uv + pillow).
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { mapFiles, cleanCode } from './maps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function dynamicMapFile(mapCode, side, format) {
  if (!format || format <= 5) return null;
  const file = mapFiles[cleanCode(mapCode)];
  if (!file || !fs.existsSync(path.join(__dirname, file))) return null;
  const sideArg = side === 'АТАКА' ? 'atk' : 'def';
  const outName = `_dyn_${sideArg}.png`;
  const out = path.join(__dirname, outName);
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const p = spawn('uv', ['run', '--with', 'pillow', 'python', 'map-extra.py', file, sideArg, String(format), outName],
      { cwd: __dirname, env: { ...process.env, PYTHONUTF8: '1' } });
    p.on('close', (c) => fin(c === 0 && fs.existsSync(out) ? out : null));
    p.on('error', () => fin(null));
    setTimeout(() => { try { p.kill(); } catch { /* ignore */ } fin(null); }, 60000);
  });
}
