import { Chess } from 'chess.js';
import { getEngine } from './stockfishClient';
import type { PositionEval } from '../analysis/review';

export interface EvaluateOptions {
  depth: number;
  multiPv?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Giới hạn thời gian mỗi thế cờ theo độ sâu (Nhanh / Chuẩn / Sâu) */
export const maxMsFor = (depth: number) => (depth <= 12 ? 1000 : depth <= 16 ? 2500 : 6000);

/** Thế cờ đã kết thúc → không cần engine */
export function terminalEval(fen: string): PositionEval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { lines: [{ score: { mate: 0 }, pv: [] }] };
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { lines: [{ score: { cp: 0 }, pv: [] }] };
  return null;
}

/** Phân tích lần lượt từng thế cờ (N+1 thế) bằng Stockfish */
export async function evaluatePositions(fens: string[], opts: EvaluateOptions): Promise<PositionEval[]> {
  const engine = await getEngine();
  await engine.newGame();
  const onAbort = () => engine.stop();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    const out: PositionEval[] = [];
    for (let i = 0; i < fens.length; i++) {
      if (opts.signal?.aborted) throw new DOMException('Đã hủy phân tích', 'AbortError');
      const term = terminalEval(fens[i]);
      if (term) {
        out.push(term);
      } else {
        const lines = await engine.analyze(fens[i], opts.depth, opts.multiPv ?? 2, maxMsFor(opts.depth));
        out.push({ lines: lines.map((l) => ({ score: l.score, pv: l.pv })) });
      }
      opts.onProgress?.(i + 1, fens.length);
    }
    if (opts.signal?.aborted) throw new DOMException('Đã hủy phân tích', 'AbortError');
    return out;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
