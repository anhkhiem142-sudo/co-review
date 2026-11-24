import { Chess, type Square } from 'chess.js';
import { CLASSIFY_CONFIG } from './config';

const value = (piece: string | undefined, cfg = CLASSIFY_CONFIG) => (piece ? cfg.pieceValues[piece] ?? 0 : 0);

/**
 * Static Exchange Evaluation: bên đang tới lượt có thể ăn được bao nhiêu điểm quân
 * trên ô `square` nếu hai bên lần lượt ăn đổi bằng quân rẻ nhất (dùng nước hợp lệ thật,
 * nên tự tính cả ghim/chiếu). Mỗi bên có quyền dừng ăn → kết quả ≥ 0.
 */
export function see(chess: Chess, square: Square, cfg = CLASSIFY_CONFIG): number {
  const target = chess.get(square);
  if (!target) return 0;
  const captures = chess
    .moves({ verbose: true })
    .filter((m) => m.to === square && m.captured)
    .sort((a, b) => value(a.piece, cfg) - value(b.piece, cfg));
  if (captures.length === 0) return 0;
  const m = captures[0];
  chess.move(m);
  const gain = value(target.type, cfg) + (m.promotion ? value(m.promotion, cfg) - 1 : 0) - see(chess, square, cfg);
  chess.undo();
  return Math.max(0, gain);
}

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] };
}

/** Đổi lượt đi trong FEN (để đo quân nào đang bị treo trước nước đi). Trả null nếu FEN không hợp lệ. */
function flipTurn(fen: string): Chess | null {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    return new Chess(parts.join(' '));
  } catch {
    return null;
  }
}

/**
 * Giá trị quân mà người đi "thí" bằng nước `uci` từ thế `fenBefore`:
 * max over quân của người đi (sau nước đi) của [SEE đối thủ ăn được − mức đã bị treo từ trước],
 * trừ đi giá trị quân người đi vừa ăn. > 0 nghĩa là để quân bị bắt mà không đổi lại đủ.
 */
export function sacrificeValue(fenBefore: string, uci: string, cfg = CLASSIFY_CONFIG): number {
  const chess = new Chess(fenBefore);
  const mover = chess.turn();
  let played;
  try {
    played = chess.move(uciToMove(uci));
  } catch {
    return 0;
  }
  if (chess.isCheckmate()) return 0;
  const captured = value(played.captured, cfg);
  const before = flipTurn(fenBefore);

  let worst = 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== mover || p.type === 'k') continue;
      const lost = see(chess, p.square, cfg);
      if (lost <= 0) continue;
      // Quân vừa đi: tính toàn bộ. Quân khác: chỉ tính phần bị treo thêm do nước đi này.
      const already = p.square === played.to || !before ? 0 : see(before, p.square, cfg);
      worst = Math.max(worst, lost - already);
    }
  }
  return worst - captured;
}

/** Nước đi có phải ăn lại quân ở đúng ô đối thủ vừa ăn không */
export function isRecapture(uci: string, prevUci: string | undefined, prevWasCapture: boolean): boolean {
  return !!prevUci && prevWasCapture && uci.slice(2, 4) === prevUci.slice(2, 4);
}
