import { Chess } from 'chess.js';
import { CLASSIFY_CONFIG } from './config';
import { classifyMove } from './classify';
import { gameAccuracy, type GameAccuracy } from './accuracy';
import { isRecapture, sacrificeValue, uciToMove } from './material';
import { lookupOpening, type EcoMap, type Opening } from './openings';
import { expectedPoints, moveAccuracy, negateScore, scoreToCp, winPercent } from './winProb';
import type { Classification } from './types';
import type { EngineScore } from '../engine/stockfishClient';
import type { ParsedGame } from '../game/parseGame';

/** Kết quả engine cho 1 thế cờ (điểm theo góc nhìn bên đang tới lượt) */
export interface PositionEval {
  lines: { score: EngineScore; pv: string[] }[];
}

export interface MoveReview {
  ply: number;
  san: string;
  uci: string;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  classification: Classification;
  /** độ mất EP (0..1) */
  loss: number;
  /** accuracy của nước (0..100) */
  accuracy: number;
  /** EP tốt nhất / đã đi, góc nhìn người đi */
  epBest: number;
  epPlayed: number;
  /** Nước tốt nhất theo engine (ở thế cờ trước nước đi) */
  bestUci?: string;
  bestSan?: string;
  /** Biến chính (SAN) bắt đầu từ nước tốt nhất */
  bestPvSan: string[];
  /** Điểm sau nước đi, góc nhìn Trắng */
  evalAfter: EngineScore;
  opening?: Opening;
}

export interface GameReview {
  moves: MoveReview[];
  /** Điểm của N+1 thế cờ, góc nhìn Trắng */
  whiteEvals: EngineScore[];
  /** Win% của N+1 thế cờ, góc nhìn Trắng */
  whiteWinPcts: number[];
  accuracy: GameAccuracy;
  opening?: Opening;
  /** Điểm thô của engine cho N+1 thế cờ (có biến chính — dùng để diễn lại "nếu đi chuẩn thì sao") */
  positions: PositionEval[];
}

const toWhite = (score: EngineScore, fen: string): EngineScore =>
  fen.split(' ')[1] === 'w' ? score : negateScore(score);

/** Đổi biến chính UCI → SAN (dừng khi gặp nước không hợp lệ) */
export function pvToSan(fen: string, pv: string[], max = 8): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      out.push(chess.move(uciToMove(uci)).san);
    } catch {
      break;
    }
  }
  return out;
}

export interface EvaluateMoveInput {
  move: { uci: string; fenBefore: string };
  /** Điểm engine ở thế trước nước đi (MultiPV 2 nếu có) */
  before?: PositionEval;
  /** Điểm engine ở thế sau nước đi */
  after?: PositionEval;
  isBook: boolean;
  prevMove?: { uci: string; captured?: string };
  prev?: { classification: Classification; epBest: number };
}

export interface MoveEvaluation {
  classification: Classification;
  loss: number;
  accuracy: number;
  epBest: number;
  epPlayed: number;
}

/** Phân loại 1 nước từ điểm engine trước/sau — dùng chung cho Review và chế độ Đấu với máy */
export function evaluateMove(i: EvaluateMoveInput, cfg = CLASSIFY_CONFIG): MoveEvaluation {
  const best = i.before?.lines[0];
  const second = i.before?.lines[1];
  const m = i.move;

  const epBest = best ? expectedPoints(best.score, cfg) : 0.5;
  const epSecond = second ? expectedPoints(second.score, cfg) : undefined;
  const isEngineBest = !!best && best.pv[0] === m.uci;

  let epPlayed: number;
  if (isEngineBest) epPlayed = epBest;
  else if (second && second.pv[0] === m.uci) epPlayed = epSecond!;
  else if (i.after?.lines[0]) epPlayed = expectedPoints(negateScore(i.after.lines[0].score), cfg);
  else epPlayed = epBest;

  const loss0 = isEngineBest ? 0 : Math.max(0, epBest - epPlayed);
  const b = cfg.brilliant;
  // Chỉ tính thí quân khi có khả năng là Brilliant (đỡ tốn thời gian)
  const sacrifice =
    !i.isBook && loss0 <= b.maxLoss && epBest >= b.minEpBefore && epBest <= b.maxEpBefore
      ? sacrificeValue(m.fenBefore, m.uci, cfg)
      : 0;

  const { classification, loss } = classifyMove(
    {
      epBest,
      epSecond,
      epPlayed,
      isEngineBest,
      isBook: i.isBook,
      sacrifice,
      isRecapture: isRecapture(m.uci, i.prevMove?.uci, !!i.prevMove?.captured),
      legalMoveCount: new Chess(m.fenBefore).moves().length,
      prev: i.prev,
    },
    cfg,
  );
  return { classification, loss, accuracy: moveAccuracy(loss * 100, cfg), epBest, epPlayed };
}

/**
 * Dựng kết quả review từ ván cờ + điểm engine của N+1 thế cờ.
 * Hàm thuần (không gọi engine) → đổi config là tính lại ngay, không cần phân tích lại.
 */
export function buildReview(game: ParsedGame, positions: PositionEval[], eco?: EcoMap, cfg = CLASSIFY_CONFIG): GameReview {
  const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)];
  const whiteEvals = positions.map((p, i) => toWhite(p.lines[0]?.score ?? { cp: 0 }, fens[i]));
  const whiteWinPcts = whiteEvals.map((s) => winPercent(scoreToCp(s, cfg), cfg));

  const moves: MoveReview[] = [];
  let inBook = !!eco;
  let opening: Opening | undefined;

  game.moves.forEach((m, i) => {
    const pos = positions[i];
    const best = pos?.lines[0];

    // Book: chỉ khi tất cả nước trước đó cũng là book
    const op = inBook ? lookupOpening(eco, m.fenAfter) : undefined;
    if (op) opening = op;
    else inBook = false;

    const prevReview = moves[i - 1];
    const { classification, loss, accuracy, epBest, epPlayed } = evaluateMove(
      {
        move: m,
        before: pos,
        after: positions[i + 1],
        isBook: !!op,
        prevMove: game.moves[i - 1],
        prev: prevReview ? { classification: prevReview.classification, epBest: prevReview.epBest } : undefined,
      },
      cfg,
    );

    moves.push({
      ply: i,
      san: m.san,
      uci: m.uci,
      color: m.color,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
      classification,
      loss,
      accuracy,
      epBest,
      epPlayed,
      bestUci: best?.pv[0],
      bestSan: best ? pvToSan(m.fenBefore, best.pv, 1)[0] : undefined,
      bestPvSan: best ? pvToSan(m.fenBefore, best.pv) : [],
      evalAfter: whiteEvals[i + 1] ?? { cp: 0 },
      opening: op,
    });
  });

  return {
    moves,
    whiteEvals,
    whiteWinPcts,
    accuracy: gameAccuracy(
      moves.map((m) => m.accuracy),
      whiteWinPcts,
      cfg,
    ),
    opening,
    positions,
  };
}
