// Tạo src/data/eco.json từ dữ liệu khai cuộc của lichess-org/chess-openings (CC0).
// Kết quả: { "<EPD>": ["<ECO>", "<Tên khai cuộc>"] } — EPD = 4 trường đầu của FEN.
// Chạy: npm run eco
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const out = {};
let count = 0;

for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const res = await fetch(`${BASE}${f}.tsv`);
  if (!res.ok) throw new Error(`Tải ${f}.tsv lỗi: ${res.status}`);
  const rows = (await res.text()).trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const epd = chess.fen().split(' ').slice(0, 4).join(' ');
    // Nếu trùng thế cờ, giữ tên ngắn hơn (thường là tên tổng quát hơn)
    if (!out[epd] || name.length < out[epd][1].length) out[epd] = [eco, name];
    count++;
  }
}

mkdirSync(join(root, 'src', 'data'), { recursive: true });
writeFileSync(join(root, 'src', 'data', 'eco.json'), JSON.stringify(out));
console.log(`[eco] ${count} dòng → ${Object.keys(out).length} thế cờ`);
