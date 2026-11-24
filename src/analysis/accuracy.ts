import { CLASSIFY_CONFIG } from './config';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function stdDev(xs: number[]): number {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
}

export function harmonicMean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.length / xs.reduce((s, x) => s + 1 / Math.max(1, x), 0);
}

export function weightedMean(xs: number[], ws: number[]): number {
  const wsum = ws.reduce((s, w) => s + w, 0);
  if (wsum === 0) return 0;
  return xs.reduce((s, x, i) => s + x * ws[i], 0) / wsum;
}

/**
 * Trọng số theo độ biến động (giống Lichess): mỗi nước i có trọng số = độ lệch chuẩn của Win%
 * trong một cửa sổ trượt quanh nó, kẹp [0.5, 12]. Nước trong đoạn ván căng thẳng nặng ký hơn.
 * @param whiteWinPcts Win% (góc nhìn Trắng) của N+1 thế cờ (trước nước 1 … sau nước N)
 */
export function volatilityWeights(whiteWinPcts: number[]): number[] {
  const n = whiteWinPcts.length - 1;
  if (n <= 0) return [];
  const size = clamp(Math.floor(n / 10), 2, 8);
  const windows: number[][] = [];
  const first = whiteWinPcts.slice(0, size);
  for (let i = 0; i < Math.min(size, whiteWinPcts.length) - 2; i++) windows.push(first);
  for (let i = 0; i + size <= whiteWinPcts.length; i++) windows.push(whiteWinPcts.slice(i, i + size));
  return windows.slice(0, n).map((w) => clamp(stdDev(w), 0.5, 12));
}

export interface GameAccuracy {
  white: number;
  black: number;
}

/**
 * Accuracy cả ván cho hai bên.
 * @param moveAccuracies accuracy từng nước (ply 0 = nước đầu của Trắng)
 * @param whiteWinPcts Win% (góc nhìn Trắng) của N+1 thế cờ
 */
export function gameAccuracy(moveAccuracies: number[], whiteWinPcts: number[], cfg = CLASSIFY_CONFIG): GameAccuracy {
  const weights = volatilityWeights(whiteWinPcts);
  const side = (parity: number) => {
    const accs: number[] = [];
    const ws: number[] = [];
    moveAccuracies.forEach((a, i) => {
      if (i % 2 === parity) {
        accs.push(a);
        ws.push(weights[i] ?? 1);
      }
    });
    if (accs.length === 0) return 0;
    if (cfg.accuracy.method === 'mean') return accs.reduce((s, x) => s + x, 0) / accs.length;
    return (weightedMean(accs, ws) + harmonicMean(accs)) / 2;
  };
  return { white: side(0), black: side(1) };
}
