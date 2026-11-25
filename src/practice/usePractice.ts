import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { uciToMove } from '../analysis/material';
import { loadEco, lookupOpening, type EcoMap } from '../analysis/openings';
import { evaluateMove, type MoveEvaluation, type PositionEval } from '../analysis/review';
import { terminalEval } from '../engine/analyzeGame';
import { getEngine } from '../engine/stockfishClient';

// Bàn tự luyện tập: người chơi đi cả hai màu, Stockfish hết sức phân tích thế cờ hiện tại
// (nhanh ở độ sâu 12 rồi sâu dần tới 22) để gợi ý nước tốt nhất và chấm nước vừa đi.

export const START_FEN = new Chess().fen();
const SAVE_KEY = 'co-review:practice';
const QUICK = { depth: 12, ms: 800 };
const DEEP = { depth: 22, ms: 5000 };

export interface PracticeMove {
  ply: number;
  san: string;
  uci: string;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  captured?: string;
}

export interface PositionAnalysis extends PositionEval {
  fen: string;
  depth: number;
  final: boolean;
}

export interface PracticeEval extends MoveEvaluation {
  isBook: boolean;
}

interface Saved {
  startFen: string;
  ucis: string[];
  cursor: number;
  showHints: boolean;
}

function load(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Saved | null;
    return s && typeof s.startFen === 'string' && Array.isArray(s.ucis) ? s : null;
  } catch {
    return null;
  }
}

/** Dựng lại danh sách nước từ FEN xuất phát + chuỗi UCI (dừng ở nước không hợp lệ) */
export function replay(startFen: string, ucis: string[]): PracticeMove[] {
  const chess = new Chess(startFen);
  const out: PracticeMove[] = [];
  for (const u of ucis) {
    try {
      const mv = chess.move(uciToMove(u));
      out.push({ ply: out.length, san: mv.san, uci: u, color: mv.color, fenBefore: mv.before, fenAfter: mv.after, captured: mv.captured });
    } catch {
      break;
    }
  }
  return out;
}

/** Đọc FEN hoặc PGN người dùng dán vào → thế xuất phát + các nước */
export function parsePosition(text: string): { startFen: string; ucis: string[] } {
  const t = text.trim();
  if (!t) throw new Error('Chưa nhập gì.');
  // FEN: 6 trường, trường đầu có 7 dấu "/"
  if (/^[^\s]+\/[^\s]+(\s+[wb]\b.*)?$/.test(t) && t.split('/').length === 8) {
    const fen = t.split(/\s+/).length >= 4 ? t : `${t} w - - 0 1`;
    try {
      return { startFen: new Chess(fen).fen(), ucis: [] };
    } catch (e) {
      throw new Error('FEN không hợp lệ: ' + (e as Error).message);
    }
  }
  const chess = new Chess();
  try {
    chess.loadPgn(t);
  } catch (e) {
    throw new Error('Không đọc được FEN/PGN: ' + (e as Error).message);
  }
  const hist = chess.history({ verbose: true });
  const startFen = hist[0]?.before ?? chess.fen();
  return { startFen, ucis: hist.map((m) => m.from + m.to + (m.promotion ?? '')) };
}

export function usePractice() {
  const saved = useMemo(load, []);
  const [startFen, setStartFen] = useState(saved?.startFen ?? START_FEN);
  const [moves, setMoves] = useState<PracticeMove[]>(() => (saved ? replay(saved.startFen, saved.ucis) : []));
  const [cursor, setCursor] = useState(() => (saved ? Math.min(saved.cursor, saved.ucis.length) : 0));
  const [showHints, setShowHints] = useState(saved?.showHints ?? true);
  const [analysis, setAnalysis] = useState<PositionAnalysis | null>(null);
  const [evals, setEvals] = useState<Record<string, PracticeEval>>({});
  const [eco, setEco] = useState<EcoMap | undefined>();

  const cacheRef = useRef(new Map<string, PositionAnalysis>());
  const genRef = useRef(0);

  const fen = cursor === 0 ? startFen : moves[cursor - 1].fenAfter;

  useEffect(() => {
    loadEco().then(setEco).catch(() => undefined);
  }, []);

  // Lưu tiến độ
  useEffect(() => {
    try {
      const s: Saved = { startFen, ucis: moves.map((m) => m.uci), cursor, showHints };
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {
      /* bỏ qua */
    }
  }, [startFen, moves, cursor, showHints]);

  // Phân tích thế cờ hiện tại: nhanh trước, sâu sau. Đổi thế cờ → dừng phân tích cũ.
  useEffect(() => {
    const gen = ++genRef.current;
    const cached = cacheRef.current.get(fen);
    if (cached) setAnalysis(cached);
    else setAnalysis(null);
    if (cached?.final) return;

    const term = terminalEval(fen);
    if (term) {
      const a = { ...term, fen, depth: 0, final: true };
      cacheRef.current.set(fen, a);
      setAnalysis(a);
      return;
    }

    let stopped = false;
    (async () => {
      const engine = await getEngine();
      const run = async (depth: number, ms: number, final: boolean) => {
        const lines = await engine.analyze(fen, depth, 2, ms);
        if (gen !== genRef.current || stopped) return false;
        const a: PositionAnalysis = {
          fen,
          depth: lines[0]?.depth ?? depth,
          final,
          lines: lines.map((l) => ({ score: l.score, pv: l.pv })),
        };
        cacheRef.current.set(fen, a);
        setAnalysis(a);
        return true;
      };
      if (!cached && !(await run(QUICK.depth, QUICK.ms, false))) return;
      await run(DEEP.depth, DEEP.ms, true);
    })().catch((e) => console.warn('[practice]', e));

    return () => {
      stopped = true;
      getEngine()
        .then((e) => e.stop())
        .catch(() => undefined);
    };
  }, [fen]);

  // Chấm mọi nước đã có điểm của thế trước và thế sau (nước đi quá nhanh sẽ được chấm
  // khi bạn quay lại xem nó). Chấm lại khi có kết quả sâu hơn.
  useEffect(() => {
    const next: Record<string, PracticeEval> = {};
    let changed = false;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const key = `${m.ply}|${m.fenBefore}|${m.uci}`;
      const before = cacheRef.current.get(m.fenBefore);
      const after = cacheRef.current.get(m.fenAfter);
      if (!before || !after) continue;
      const quality = (before.final ? 1 : 0) + (after.final ? 1 : 0);
      const old = (next[key] ?? evals[key]) as (PracticeEval & { q?: number }) | undefined;
      if (old && (old.q ?? 0) >= quality) continue;
      const pm = moves[i - 1];
      const prev = pm ? (next[`${pm.ply}|${pm.fenBefore}|${pm.uci}`] ?? evals[`${pm.ply}|${pm.fenBefore}|${pm.uci}`]) : undefined;
      // Book: chỉ khi ván bắt đầu từ thế ban đầu và mọi nước tới đây đều có trong dữ liệu khai cuộc
      const isBook = !!eco && startFen === START_FEN && moves.slice(0, i + 1).every((x) => !!lookupOpening(eco, x.fenAfter));
      const ev = evaluateMove({
        move: m,
        before,
        after,
        isBook,
        prevMove: pm,
        prev: prev ? { classification: prev.classification, epBest: prev.epBest } : undefined,
      });
      next[key] = { ...ev, isBook, q: quality } as PracticeEval;
      changed = true;
    }
    if (changed) setEvals((s) => ({ ...s, ...next }));
  }, [analysis, moves, eco, startFen, evals]);

  const evalOf = useCallback((m: PracticeMove) => evals[`${m.ply}|${m.fenBefore}|${m.uci}`], [evals]);
  /** Nước tốt nhất đã biết của một thế cờ (từ cache phân tích) */
  const bestFor = useCallback((f: string) => cacheRef.current.get(f)?.lines[0]?.pv[0], []);

  /** Đi 1 nước (bên nào tới lượt cũng được). Đang ở giữa ván thì cắt bỏ các nước phía sau. */
  const move = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const chess = new Chess(fen);
      let mv;
      try {
        mv = chess.move({ from, to, promotion });
      } catch {
        return false;
      }
      const pm: PracticeMove = {
        ply: cursor,
        san: mv.san,
        uci: mv.from + mv.to + (mv.promotion ?? ''),
        color: mv.color,
        fenBefore: mv.before,
        fenAfter: mv.after,
        captured: mv.captured,
      };
      // Đi đúng nước kế tiếp đã có → chỉ tiến lên
      if (moves[cursor]?.uci === pm.uci) {
        setCursor(cursor + 1);
        return true;
      }
      setMoves((ms) => [...ms.slice(0, cursor), pm]);
      setCursor(cursor + 1);
      return true;
    },
    [fen, cursor, moves],
  );

  const goTo = useCallback((p: number) => setCursor(Math.max(0, Math.min(moves.length, p))), [moves.length]);

  const reset = useCallback((newStart = START_FEN, ucis: string[] = []) => {
    setStartFen(newStart);
    const ms = replay(newStart, ucis);
    setMoves(ms);
    setCursor(ms.length);
  }, []);

  /** Gợi ý: nước tốt nhất ở thế hiện tại (chỉ quân nào đi tới đâu) */
  const best = analysis?.fen === fen ? analysis.lines[0] : undefined;
  const bestUci = best?.pv[0];

  return {
    startFen,
    moves,
    cursor,
    fen,
    analysis: analysis?.fen === fen ? analysis : null,
    bestUci,
    showHints,
    setShowHints,
    evalOf,
    bestFor,
    move,
    goTo,
    reset,
  };
}
