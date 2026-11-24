import { Chess } from 'chess.js';
import { CLASSIFY_CONFIG } from './config';
import type { Square } from 'chess.js';
import { see, uciToMove } from './material';

// Diễn giải một biến (chuỗi nước) của engine thành lời: mỗi nước có chú thích
// (ăn quân, chiếu, chiếu hết…), cộng điểm quân chạy theo và câu tổng kết cuối biến.

const PIECE_VI: Record<string, string> = { p: 'Tốt', n: 'Mã', b: 'Tượng', r: 'Xe', q: 'Hậu', k: 'Vua' };
const ORDER = ['q', 'r', 'b', 'n', 'p'];

export interface LineStep {
  /** ply trong ván (để đánh số nước) */
  ply: number;
  san: string;
  uci: string;
  color: 'w' | 'b';
  /** FEN sau nước này */
  fen: string;
  /** Người đi là "bạn" hay "đối thủ" */
  isMe: boolean;
  notes: string[];
  /** Chênh lệch điểm quân (bạn − đối thủ) sau nước này */
  balance: number;
  capture: boolean;
  check: boolean;
}

export interface LineExplanation {
  startFen: string;
  startBalance: number;
  steps: LineStep[];
  /**
   * Điểm quân (bạn − đối thủ) khi trao đổi đã ngã ngũ. Thường bằng balance của nước cuối;
   * nếu biến của engine hết đúng lúc vừa ăn quân thì đã cộng/trừ thêm nước ăn lại.
   */
  endBalance: number;
  /** Biến hết giữa lúc đổi quân → endBalance đã tính thêm nước ăn lại */
  settled: boolean;
  /** Câu tổng kết cuối biến */
  summary: string;
}

/** Số nước tối đa được kéo dài thêm để không dừng giữa lúc đổi quân */
const QUIET_EXTENSION = 6;

/** Điểm quân của `color` trừ điểm quân bên kia */
export function materialBalance(fen: string, color: 'w' | 'b'): number {
  const v = CLASSIFY_CONFIG.pieceValues;
  let s = 0;
  for (const row of new Chess(fen).board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * (v[p.type] ?? 0);
  return s;
}

function countPieces(fen: string): Record<'w' | 'b', Record<string, number>> {
  const out = { w: {} as Record<string, number>, b: {} as Record<string, number> };
  for (const row of new Chess(fen).board()) for (const p of row) if (p) out[p.color][p.type] = (out[p.color][p.type] ?? 0) + 1;
  return out;
}

/** "1 Tượng, 2 Tốt" — các quân bị giảm đi giữa hai thế cờ */
function lostPieces(before: Record<string, number>, after: Record<string, number>): string {
  return ORDER.map((t) => [t, (before[t] ?? 0) - (after[t] ?? 0)] as const)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${PIECE_VI[t]}`)
    .join(', ');
}

const plyOf = (fen: string) => {
  const p = fen.split(' ');
  return (Number(p[5] ?? 1) - 1) * 2 + (p[1] === 'b' ? 1 : 0);
};

/** Số thứ tự nước dạng "12." / "12…" */
export const stepNumber = (ply: number) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;

/** Nước `uci` có ăn quân không (kể cả bắt tốt qua đường) */
function isCaptureMove(chess: Chess, uci: string): boolean {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  if (chess.get(to)) return true;
  const p = chess.get(from);
  return p?.type === 'p' && from[0] !== to[0];
}

/**
 * Diễn giải biến `ucis` bắt đầu từ `startFen`, theo góc nhìn người chơi `myColor`.
 * Đi khoảng `maxPlies` nước, nhưng KHÔNG dừng giữa lúc đổi quân: nếu nước cuối là ăn quân / chiếu
 * hoặc nước kế tiếp là ăn quân thì đi tiếp (tối đa thêm QUIET_EXTENSION nước). Nếu biến của engine
 * hết đúng lúc vừa ăn quân, tính thêm nước ăn lại bằng SEE.
 */
export function explainLine(startFen: string, ucis: string[], myColor: 'w' | 'b', maxPlies = 10): LineExplanation {
  const chess = new Chess(startFen);
  const startBalance = materialBalance(startFen, myColor);
  const startPly = plyOf(startFen);
  const steps: LineStep[] = [];

  for (let i = 0; i < ucis.length; i++) {
    const uci = ucis[i];
    if (i >= maxPlies) {
      // Chỉ đi tiếp khi trao đổi chưa xong (nước kế là ăn quân) hoặc đang bị chiếu
      const inCheck = !!steps[steps.length - 1]?.check;
      if (i >= maxPlies + QUIET_EXTENSION || !(inCheck || isCaptureMove(chess, uci))) break;
    }
    let mv;
    try {
      mv = chess.move(uciToMove(uci));
    } catch {
      break;
    }
    const isMe = mv.color === myColor;
    const notes: string[] = [];
    if (mv.captured) notes.push(`ăn ${PIECE_VI[mv.captured]} ở ${mv.to}`);
    if (mv.promotion) notes.push(`phong cấp thành ${PIECE_VI[mv.promotion]}`);
    if (mv.isKingsideCastle() || mv.isQueensideCastle()) notes.push('nhập thành');
    if (chess.isCheckmate()) notes.push('chiếu hết!');
    else if (chess.inCheck()) notes.push('chiếu');
    const fen = chess.fen();
    steps.push({
      ply: startPly + steps.length,
      san: mv.san,
      uci,
      color: mv.color,
      fen,
      isMe,
      notes,
      balance: materialBalance(fen, myColor),
      capture: !!mv.captured,
      check: chess.inCheck(),
    });
  }

  // Biến hết đúng lúc vừa ăn quân → tính nước ăn lại (nếu có lời cho bên tới lượt)
  const last = steps[steps.length - 1];
  let endBalance = last?.balance ?? startBalance;
  let settled = false;
  if (last?.capture && !chess.isGameOver()) {
    const gain = see(chess, last.uci.slice(2, 4) as Square);
    if (gain > 0) {
      endBalance += chess.turn() === myColor ? gain : -gain;
      settled = true;
    }
  }

  return {
    startFen,
    startBalance,
    steps,
    endBalance,
    settled,
    summary: summarize(startFen, steps, myColor, startBalance, endBalance, settled),
  };
}

export interface MaterialSwing {
  /** Thay đổi điểm quân của `color` sau biến (âm = thiệt) */
  diff: number;
  /** Quân `color` mất, vd. "1 Mã" */
  ownLost: string;
  /** Quân bên kia mất */
  oppLost: string;
  /** Các nước (SAN) trong cửa sổ đã xét */
  sans: string[];
  /** ply bắt đầu (để đánh số nước) */
  startPly: number;
}

/**
 * Điểm quân thay đổi thế nào sau khoảng `maxPlies` nước của biến
 * (không dừng giữa lúc đổi quân — xem explainLine).
 */
export function materialSwing(startFen: string, ucis: string[], color: 'w' | 'b', maxPlies = 10): MaterialSwing {
  const exp = explainLine(startFen, ucis, color, maxPlies);
  const last = exp.steps[exp.steps.length - 1];
  const endFen = last?.fen ?? startFen;
  const opp = color === 'w' ? 'b' : 'w';
  const a = countPieces(startFen);
  const b = countPieces(endFen);
  return {
    diff: exp.endBalance - exp.startBalance,
    ownLost: lostPieces(a[color], b[color]),
    oppLost: lostPieces(a[opp], b[opp]),
    sans: exp.steps.map((s) => s.san),
    startPly: plyOf(startFen),
  };
}

/** "8. Nb5 Qd7 9. Nxc7+" */
export function formatSans(startPly: number, sans: string[]): string {
  return sans
    .map((san, i) => {
      const ply = startPly + i;
      if (ply % 2 === 0) return `${Math.floor(ply / 2) + 1}. ${san}`;
      return i === 0 ? `${Math.floor(ply / 2) + 1}… ${san}` : san;
    })
    .join(' ');
}

function summarize(
  startFen: string,
  steps: LineStep[],
  myColor: 'w' | 'b',
  startBalance: number,
  endBalance: number,
  settled: boolean,
): string {
  if (steps.length === 0) return 'Không có biến để hiển thị.';
  const last = steps[steps.length - 1];
  const n = Math.ceil(steps.length / 2);
  if (last.notes.includes('chiếu hết!')) return last.isMe ? `Bạn chiếu hết sau ${n} nước.` : `Bạn bị chiếu hết sau ${n} nước.`;

  const opp = myColor === 'w' ? 'b' : 'w';
  const a = countPieces(startFen);
  const b = countPieces(last.fen);
  const meLost = lostPieces(a[myColor], b[myColor]);
  const oppLost = lostPieces(a[opp], b[opp]);
  const diff = endBalance - startBalance;

  const parts: string[] = [];
  if (meLost || oppLost) {
    parts.push(
      [meLost && `bạn mất ${meLost}`, oppLost && `đối thủ mất ${oppLost}`].filter(Boolean).join(', ') + '.',
    );
  }
  if (settled) parts.push('Biến của engine dừng đúng lúc vừa ăn quân, nên đã tính thêm nước ăn lại.');
  if (diff <= -1) parts.push(`Tính ra bạn thiệt ${-diff} điểm quân.`);
  else if (diff >= 1) parts.push(`Tính ra bạn lời ${diff} điểm quân.`);
  else parts.push('Quân số hai bên vẫn ngang nhau — khác biệt nằm ở thế cờ (vị trí quân, an toàn của Vua, tốt thông…).');

  const head = `Sau ${steps.length} nước`;
  return `${head}: ${parts.join(' ')}`.replace(': b', ': B').replace(': đ', ': Đ');
}
