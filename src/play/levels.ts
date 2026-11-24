import { scoreToCp } from '../analysis/winProb';
import type { EngineScore } from '../engine/stockfishClient';

// ============================================================
//  CÁC MỨC CỦA MÁY ĐỐI THỦ — chỉnh tại đây.
//  Stockfish chỉ hỗ trợ UCI_Elo từ 1320 trở lên, nên các mức thấp hơn
//  được làm yếu bằng cách: tính nông + chọn ngẫu nhiên có trọng số trong
//  top N nước + thỉnh thoảng đi một nước bất kỳ. Elo các mức này là ƯỚC LƯỢNG.
// ============================================================

export interface Level {
  id: string;
  label: string;
  /** Elo ước lượng để hiển thị */
  elo: number;
  desc: string;
  /** weak = tự làm yếu; uci = UCI_LimitStrength + UCI_Elo; max = hết sức */
  mode: 'weak' | 'uci' | 'max';
  depth: number;
  /** Số biến engine trả về để chọn (chỉ dùng cho mode weak) */
  multiPv: number;
  /** Độ "ngẫu hứng" (cp): càng lớn càng hay chọn nước kém hơn nước tốt nhất */
  temperature: number;
  /** Xác suất đi một nước hợp lệ bất kỳ (sai sót kiểu người mới) */
  randomChance: number;
  /** Giới hạn thời gian nghĩ (ms) */
  moveTimeMs: number;
  uciElo?: number;
}

export const LEVELS: Level[] = [
  { id: 'newbie', label: 'Người mới', elo: 500, desc: 'Hay để hở quân, phù hợp mới học luật', mode: 'weak', depth: 2, multiPv: 5, temperature: 300, randomChance: 0.3, moveTimeMs: 300 },
  { id: 'basic', label: 'Cơ bản', elo: 800, desc: 'Biết ăn quân, đôi khi sai đơn giản', mode: 'weak', depth: 4, multiPv: 5, temperature: 150, randomChance: 0.12, moveTimeMs: 400 },
  { id: 'medium', label: 'Trung bình', elo: 1200, desc: 'Ít sai, biết đòn chiến thuật ngắn', mode: 'weak', depth: 7, multiPv: 4, temperature: 60, randomChance: 0.04, moveTimeMs: 600 },
  { id: 'good', label: 'Khá', elo: 1600, desc: 'Chơi chắc, trừng phạt lỗi rõ ràng', mode: 'uci', depth: 30, multiPv: 1, temperature: 0, randomChance: 0, moveTimeMs: 800, uciElo: 1600 },
  { id: 'strong', label: 'Mạnh', elo: 2000, desc: 'Ngang kỳ thủ câu lạc bộ mạnh', mode: 'uci', depth: 30, multiPv: 1, temperature: 0, randomChance: 0, moveTimeMs: 1000, uciElo: 2000 },
  { id: 'master', label: 'Kiện tướng', elo: 2400, desc: 'Rất khó thắng', mode: 'uci', depth: 30, multiPv: 1, temperature: 0, randomChance: 0, moveTimeMs: 1200, uciElo: 2400 },
  { id: 'max', label: 'Tối đa', elo: 3000, desc: 'Stockfish hết sức', mode: 'max', depth: 30, multiPv: 1, temperature: 0, randomChance: 0, moveTimeMs: 1500 },
];

export const getLevel = (id: string) => LEVELS.find((l) => l.id === id) ?? LEVELS[1];

/** Tùy chọn UCI cần đặt cho engine đối thủ ở mức này */
export function uciOptionsFor(level: Level): Record<string, string | number | boolean> {
  if (level.mode === 'uci') return { UCI_LimitStrength: true, UCI_Elo: level.uciElo ?? 1320, 'Skill Level': 20 };
  return { UCI_LimitStrength: false, 'Skill Level': 20 };
}

export interface CandidateLine {
  score: EngineScore;
  pv: string[];
}

/**
 * Chọn nước cho máy đối thủ.
 * - uci/max: luôn đi nước số 1 của engine (engine tự giới hạn sức).
 * - weak: với xác suất randomChance đi nước hợp lệ bất kỳ; còn lại chọn trong top N
 *   theo trọng số exp(-(cpTốtNhất − cp) / temperature).
 */
export function pickMove(
  lines: CandidateLine[],
  legalUcis: string[],
  level: Level,
  rng: () => number = Math.random,
): string | null {
  const candidates = lines.filter((l) => l.pv[0]);
  if (level.mode !== 'weak' || candidates.length === 0) return candidates[0]?.pv[0] ?? legalUcis[0] ?? null;

  if (legalUcis.length > 0 && rng() < level.randomChance) {
    return legalUcis[Math.floor(rng() * legalUcis.length) % legalUcis.length];
  }

  const cps = candidates.map((l) => scoreToCp(l.score));
  const best = Math.max(...cps);
  const t = Math.max(1, level.temperature);
  const weights = cps.map((cp) => Math.exp(-(best - cp) / t));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i].pv[0];
  }
  return candidates[candidates.length - 1].pv[0];
}
