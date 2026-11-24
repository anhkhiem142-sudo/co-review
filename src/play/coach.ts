import { Chess, type Square } from 'chess.js';
import { CLASSIFY_CONFIG } from '../analysis/config';
import { see, uciToMove } from '../analysis/material';
import type { Opening } from '../analysis/openings';
import type { Classification } from '../analysis/types';
import type { EngineScore } from '../engine/stockfishClient';

// Sinh lời nhận xét kiểu "huấn luyện viên" từ kết quả engine.
// Hàm thuần (không gọi engine) → có unit test.

export type CoachTone = 'praise' | 'good' | 'neutral' | 'warn' | 'bad' | 'info';

export interface CoachMessage {
  id: number;
  tone: CoachTone;
  title: string;
  body: string;
  classification?: Classification;
  /** ply của nước được nhận xét (để bấm vào xem lại) */
  ply?: number;
}

export interface UserMoveInput {
  ply: number;
  classification: Classification;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Nước tốt nhất ở thế trước (góc nhìn người đi) */
  best?: { score: EngineScore; pv: string[] };
  /** Biến tốt nhất của đối thủ sau nước đi (điểm theo góc nhìn đối thủ) */
  reply?: { score: EngineScore; pv: string[] };
  opening?: Opening;
  canUndo: boolean;
}

const PIECE_VI: Record<string, string> = { p: 'Tốt', n: 'Mã', b: 'Tượng', r: 'Xe', q: 'Hậu', k: 'Vua' };
export const pieceName = (t: string) => PIECE_VI[t] ?? t;

let nextId = 1;
const msg = (m: Omit<CoachMessage, 'id'>): CoachMessage => ({ id: nextId++, ...m });

/** ply tương ứng FEN (0 = nước đầu của Trắng) */
function plyOf(fen: string): number {
  const parts = fen.split(' ');
  return (Number(parts[5] ?? 1) - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
}

/** UCI → SAN theo biến (dừng khi gặp nước không hợp lệ) */
export function lineToSan(fen: string, pv: string[], max = 6): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      out.push(chess.move(uciToMove(u)).san);
    } catch {
      break;
    }
  }
  return out;
}

/** "12. Nf3 Nc6 13. Bb5" */
export function formatLine(fen: string, pv: string[], max = 6): string {
  const start = plyOf(fen);
  return lineToSan(fen, pv, max)
    .map((san, i) => {
      const ply = start + i;
      if (ply % 2 === 0) return `${Math.floor(ply / 2) + 1}. ${san}`;
      return i === 0 ? `${Math.floor(ply / 2) + 1}… ${san}` : san;
    })
    .join(' ');
}

type Threat = { kind: 'mate'; moves: number; san: string } | { kind: 'wins'; piece: string; square: string; san: string };

/** Quân mà nước `uci` vừa ăn (ô + giá trị), để không báo nhầm "mất quân" khi chỉ là đổi quân */
export function capturedBy(fenBefore: string, uci: string): { square: string; value: number } | undefined {
  const to = uci.slice(2, 4) as Square;
  const p = new Chess(fenBefore).get(to);
  return p ? { square: to, value: CLASSIFY_CONFIG.pieceValues[p.type] ?? 0 } : undefined;
}

/**
 * Sau nước của mình, đối thủ có đòn gì? (chiếu hết, hoặc ăn được quân có lời ≥ 2 điểm).
 * `justCaptured`: quân mình vừa ăn ở nước đó — nếu đối thủ ăn lại đúng ô thì trừ đi (đổi quân).
 */
export function describeThreat(
  fenAfter: string,
  reply?: { score: EngineScore; pv: string[] },
  justCaptured?: { square: string; value: number },
): Threat | null {
  const replyUci = reply?.pv[0];
  if (!replyUci) return null;
  const san = lineToSan(fenAfter, [replyUci], 1)[0];
  if (!san) return null;
  if (reply.score.mate != null && reply.score.mate > 0) return { kind: 'mate', moves: reply.score.mate, san };
  const chess = new Chess(fenAfter);
  const to = replyUci.slice(2, 4) as Square;
  const target = chess.get(to);
  if (target && target.color !== chess.turn()) {
    const net = see(chess, to) - (justCaptured?.square === to ? justCaptured.value : 0);
    if (net >= 2) return { kind: 'wins', piece: pieceName(target.type), square: to, san };
  }
  return null;
}

type Missed = { kind: 'mate'; line: string } | { kind: 'capture'; piece: string; san: string };

/** Mình đã bỏ lỡ gì? (chiếu hết, hoặc ăn quân có lời) */
export function describeMissed(fenBefore: string, best?: { score: EngineScore; pv: string[] }): Missed | null {
  const bestUci = best?.pv[0];
  if (!bestUci) return null;
  if (best.score.mate != null && best.score.mate > 0) return { kind: 'mate', line: formatLine(fenBefore, best.pv, best.score.mate * 2 - 1) };
  const chess = new Chess(fenBefore);
  const to = bestUci.slice(2, 4) as Square;
  const target = chess.get(to);
  if (target && target.color !== chess.turn() && see(chess, to) >= 2) {
    const san = lineToSan(fenBefore, [bestUci], 1)[0];
    if (san) return { kind: 'capture', piece: pieceName(target.type), san };
  }
  return null;
}

const PRAISE = ['Chính xác!', 'Rất chuẩn!', 'Nước tốt nhất!', 'Hay lắm!'];
const BAD_CLASSES: Classification[] = ['inaccuracy', 'mistake', 'blunder', 'miss'];

/** Nhận xét nước đi của người chơi */
export function commentOnUserMove(i: UserMoveInput): CoachMessage {
  const base = { classification: i.classification, ply: i.ply };
  const bestSan = i.best?.pv[0] && i.best.pv[0] !== i.uci ? lineToSan(i.fenBefore, [i.best.pv[0]], 1)[0] : undefined;

  switch (i.classification) {
    case 'book':
      return msg({ ...base, tone: 'neutral', title: 'Khai cuộc', body: `${i.san} là nước lý thuyết${i.opening ? ` — ${i.opening.name}` : ''}.` });
    case 'brilliant':
      return msg({ ...base, tone: 'praise', title: 'Tuyệt diệu!', body: `${i.san} — thí quân rất đúng lúc, engine xác nhận đây là nước mạnh nhất.` });
    case 'great':
      return msg({ ...base, tone: 'praise', title: 'Nước hay!', body: `${i.san} là nước duy nhất giữ được thế cờ, các nước khác đều kém hơn hẳn.` });
    case 'best':
      return msg({ ...base, tone: 'good', title: PRAISE[i.ply % PRAISE.length], body: `${i.san} đúng là nước engine chọn.` });
    case 'excellent':
      return msg({ ...base, tone: 'good', title: 'Rất tốt', body: `${i.san} gần như tốt nhất.${bestSan ? ` Engine nhỉnh hơn một chút với ${bestSan}.` : ''}` });
    case 'good':
      return msg({ ...base, tone: 'neutral', title: 'Tạm ổn', body: `${i.san} chấp nhận được${bestSan ? `, nhưng ${bestSan} tốt hơn` : ''}.` });
  }

  // Nước sai: tìm lý do cụ thể
  const parts: string[] = [];
  const threat = describeThreat(i.fenAfter, i.reply, capturedBy(i.fenBefore, i.uci));
  const missed = describeMissed(i.fenBefore, i.best);

  if (i.classification === 'miss') parts.push(`Đối thủ vừa đi sai nhưng ${i.san} chưa tận dụng được.`);
  if (threat?.kind === 'mate') parts.push(`Sau ${i.san}, đối thủ có thể chiếu hết trong ${threat.moves} nước, bắt đầu bằng ${threat.san}.`);
  else if (threat?.kind === 'wins') parts.push(`${i.san} để mất ${threat.piece} ở ${threat.square}: đối thủ có thể đi ${threat.san}.`);
  if (missed?.kind === 'mate') parts.push(`Bạn đã bỏ lỡ nước chiếu hết: ${missed.line}.`);
  else if (missed?.kind === 'capture') parts.push(`Bạn bỏ lỡ cơ hội ăn ${missed.piece} bằng ${missed.san}.`);
  if (bestSan && i.best) {
    const line = formatLine(i.fenBefore, i.best.pv, 5);
    if (missed?.kind !== 'mate') parts.push(`Nước tốt hơn là ${bestSan} (${line}).`);
  }
  if (i.canUndo && i.classification !== 'inaccuracy') parts.push('Bấm “Đi lại” để thử nước khác.');

  const title = { inaccuracy: 'Chưa chính xác', mistake: 'Sai lầm', blunder: 'Sai nghiêm trọng!', miss: 'Bỏ lỡ cơ hội' }[
    i.classification as 'inaccuracy' | 'mistake' | 'blunder' | 'miss'
  ];
  const tone: CoachTone = i.classification === 'inaccuracy' ? 'warn' : 'bad';
  return msg({ ...base, tone, title, body: parts.join(' ') || `Nước tốt hơn là ${bestSan ?? '…'}.` });
}

/** Nhắc khi máy vừa đi sai — để người chơi tự tìm cách tận dụng */
export function commentOnOpponentMove(classification: Classification, san: string, ply: number): CoachMessage | null {
  if (classification === 'blunder')
    return msg({ tone: 'info', classification, ply, title: 'Máy vừa sai nghiêm trọng!', body: `${san} mở ra cơ hội lớn cho bạn. Hãy tìm nước tận dụng — bấm Gợi ý nếu cần.` });
  if (classification === 'mistake' || classification === 'miss')
    return msg({ tone: 'info', classification, ply, title: 'Máy vừa đi sai', body: `Sau ${san} bạn có cơ hội giành ưu thế. Thử tìm xem!` });
  return null;
}

export function infoMessage(title: string, body: string): CoachMessage {
  return msg({ tone: 'info', title, body });
}

/** Lời gợi ý từ thầy (không lộ nước ngay mà chỉ quân cần đi, trừ khi bấm lần 2) */
export function hintMessage(fen: string, bestUci: string, reveal: boolean): CoachMessage {
  const chess = new Chess(fen);
  const piece = chess.get(bestUci.slice(0, 2) as Square);
  if (!reveal && piece) {
    return msg({ tone: 'info', title: 'Gợi ý', body: `Hãy chú ý quân ${pieceName(piece.type)} ở ${bestUci.slice(0, 2)}. Bấm Gợi ý lần nữa để xem nước cụ thể.` });
  }
  const san = lineToSan(fen, [bestUci], 1)[0] ?? bestUci;
  return msg({ tone: 'info', title: 'Gợi ý', body: `Nước tốt nhất là ${san}.` });
}

export const isBadClass = (c: Classification) => BAD_CLASSES.includes(c);
