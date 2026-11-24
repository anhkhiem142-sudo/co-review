// Copy Stockfish WASM (bản lite đa luồng + lite 1 luồng) từ node_modules vào public/engine.
// Chạy tự động sau `npm install` (postinstall) — kể cả khi build trên Vercel.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish');
const dest = join(root, 'public', 'engine');

const files = [
  'bin/stockfish-19-lite.js',
  'bin/stockfish-19-lite.wasm',
  'bin/stockfish-19-lite-single.js',
  'bin/stockfish-19-lite-single.wasm',
  'Copying.txt',
];

if (!existsSync(src)) {
  console.warn('[copy-engine] Chưa có node_modules/stockfish, bỏ qua.');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of files) {
  const name = f.split('/').pop();
  copyFileSync(join(src, f), join(dest, name === 'Copying.txt' ? 'STOCKFISH-LICENSE.txt' : name));
}
console.log(`[copy-engine] Đã copy ${files.length} file vào public/engine`);
