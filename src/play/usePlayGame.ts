import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { uciToMove } from '../analysis/material';
import { loadEco, lookupOpening, type Opening } from '../analysis/openings';
import { evaluateMove, type MoveEvaluation, type PositionEval } from '../analysis/review';
import { terminalEval } from '../engine/analyzeGame';
import { getEngine, StockfishClient } from '../engine/stockfishClient';
import { hashString } from '../game/parseGame';
import { putCachedAnalysis } from '../storage/cache';
import { getUsername } from '../storage/prefs';
import { commentOnOpponentMove, commentOnUserMove, hintMessage, infoMessage, type CoachMessage } from './coach';
import { getLevel, pickMove, uciOptionsFor, type Level } from './levels';

export type Color = 'w' | 'b';

export interface PlaySettings {
  levelId: string;
  userColor: Color;
}

export interface PlayMove {
  ply: number;
  san: string;
  uci: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  captured?: string;
}

export interface MoveEval extends MoveEvaluation {
  isBook: boolean;
  opening?: Opening;
}

export type PlayStatus = 'setup' | 'user' | 'thinking' | 'over';

export interface PlayState {
  settings: PlaySettings | null;
  moves: PlayMove[];
  /** Kết quả chấm điểm theo ply (có thể chưa có khi đang phân tích) */
  evals: (MoveEval | undefined)[];
  status: PlayStatus;
  messages: CoachMessage[];
  result?: { text: string; winner: Color | null };
  undos: number;
  hints: number;
  hint?: { square: string; uci?: string };
  error?: string;
  startedAt: number;
}

interface SavedGame {
  settings: PlaySettings;
  ucis: string[];
  undos: number;
  hints: number;
  startedAt: number;
}

/** Engine huấn luyện viên: đủ sâu để chấm điểm, đủ nhanh để không phải chờ */
const COACH_DEPTH = 14;
const COACH_MS = 1500;
/** Máy luôn "nghĩ" ít nhất ngần này để người chơi kịp nhìn */
const MIN_THINK_MS = 600;
const SAVE_KEY = 'co-review:play';

const START_FEN = new Chess().fen();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const initialState = (): PlayState => ({
  settings: null,
  moves: [],
  evals: [],
  status: 'setup',
  messages: [],
  undos: 0,
  hints: 0,
  startedAt: 0,
});

export function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedGame;
    if (!s?.settings?.levelId || !Array.isArray(s.ucis)) return null;
    return s;
  } catch {
    return null;
  }
}

function clearSaved() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* bỏ qua */
  }
}

export function usePlayGame() {
  const [state, setState] = useState<PlayState>(initialState);

  const chessRef = useRef(new Chess());
  const movesRef = useRef<PlayMove[]>([]);
  const settingsRef = useRef<PlaySettings | null>(null);
  const statusRef = useRef<PlayStatus>('setup');
  const countersRef = useRef({ undos: 0, hints: 0, startedAt: 0 });
  /** Tăng mỗi khi đi lại / ván mới → bỏ qua kết quả async cũ */
  const genRef = useRef(0);
  const analysisRef = useRef(new Map<string, Promise<PositionEval>>());
  const evalRef = useRef(new Map<number, Promise<MoveEval>>());
  const opponentRef = useRef<Promise<StockfishClient> | null>(null);
  const configuredLevelRef = useRef<string | null>(null);
  const hintStageRef = useRef<{ fen: string; stage: number } | null>(null);

  useEffect(
    () => () => {
      genRef.current++;
      opponentRef.current?.then((e) => e.terminate()).catch(() => undefined);
    },
    [],
  );

  // ---------- tiện ích ----------
  const setStatus = (status: PlayStatus) => {
    statusRef.current = status;
    setState((s) => ({ ...s, status }));
  };
  const addMessage = (m: CoachMessage) => setState((s) => ({ ...s, messages: [...s.messages, m] }));

  const persist = () => {
    const settings = settingsRef.current;
    if (!settings) return;
    const saved: SavedGame = { settings, ucis: movesRef.current.map((m) => m.uci), ...countersRef.current };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    } catch {
      /* bỏ qua */
    }
  };

  /** Phân tích 1 thế cờ bằng engine huấn luyện viên (cache theo FEN) */
  function analysisFor(fen: string): Promise<PositionEval> {
    const map = analysisRef.current;
    let p = map.get(fen);
    if (!p) {
      const term = terminalEval(fen);
      p = term
        ? Promise.resolve(term)
        : getEngine()
            .then((e) => e.analyze(fen, COACH_DEPTH, 2, COACH_MS))
            .then((lines) => ({ lines: lines.map((l) => ({ score: l.score, pv: l.pv })) }));
      map.set(fen, p);
      p.catch(() => map.delete(fen));
    }
    return p;
  }

  /** Chấm điểm nước thứ `ply` (cần điểm trước/sau + nước trước đó) */
  function evalFor(ply: number): Promise<MoveEval> {
    const cached = evalRef.current.get(ply);
    if (cached) return cached;
    const m = movesRef.current[ply];
    const prevMove = movesRef.current[ply - 1];
    const p = (async () => {
      const [eco, before, after] = await Promise.all([loadEco(), analysisFor(m.fenBefore), analysisFor(m.fenAfter)]);
      const prev = ply > 0 ? await evalFor(ply - 1) : undefined;
      const opening = ply === 0 || prev?.isBook ? lookupOpening(eco, m.fenAfter) : undefined;
      const ev = evaluateMove({
        move: m,
        before,
        after,
        isBook: !!opening,
        prevMove,
        prev: prev ? { classification: prev.classification, epBest: prev.epBest } : undefined,
      });
      return { ...ev, isBook: !!opening, opening };
    })();
    evalRef.current.set(ply, p);
    return p;
  }

  const storeEval = (ply: number, ev: MoveEval, gen: number) => {
    if (gen !== genRef.current) return;
    setState((s) => {
      if (ply >= s.moves.length) return s;
      const evals = s.evals.slice();
      evals[ply] = ev;
      return { ...s, evals };
    });
  };

  async function coachUserMove(ply: number, gen: number) {
    try {
      const ev = await evalFor(ply);
      if (gen !== genRef.current) return;
      const m = movesRef.current[ply];
      const [before, after] = await Promise.all([analysisFor(m.fenBefore), analysisFor(m.fenAfter)]);
      if (gen !== genRef.current) return;
      storeEval(ply, ev, gen);
      addMessage(
        commentOnUserMove({
          ply,
          classification: ev.classification,
          san: m.san,
          uci: m.uci,
          fenBefore: m.fenBefore,
          fenAfter: m.fenAfter,
          best: before.lines[0],
          reply: after.lines[0],
          opening: ev.opening,
          canUndo: true,
        }),
      );
    } catch (e) {
      console.warn('[coach]', e);
    }
  }

  async function coachOpponentMove(ply: number, gen: number) {
    try {
      const ev = await evalFor(ply);
      if (gen !== genRef.current) return;
      storeEval(ply, ev, gen);
      const c = commentOnOpponentMove(ev.classification, movesRef.current[ply].san, ply);
      if (c) addMessage(c);
    } catch (e) {
      console.warn('[coach]', e);
    }
  }

  function applyMove(input: { from: string; to: string; promotion?: string }): PlayMove | null {
    let mv;
    try {
      mv = chessRef.current.move(input);
    } catch {
      return null;
    }
    const pm: PlayMove = {
      ply: movesRef.current.length,
      san: mv.san,
      uci: mv.from + mv.to + (mv.promotion ?? ''),
      color: mv.color,
      fenBefore: mv.before,
      fenAfter: mv.after,
      captured: mv.captured,
    };
    movesRef.current = [...movesRef.current, pm];
    const moves = movesRef.current;
    setState((s) => ({ ...s, moves, hint: undefined }));
    persist();
    return pm;
  }

  function finish(text: string, winner: Color | null) {
    statusRef.current = 'over';
    setState((s) => ({ ...s, status: 'over', result: { text, winner } }));
    addMessage(infoMessage('Kết thúc ván', text));
    clearSaved();
  }

  function checkGameOver(): boolean {
    const c = chessRef.current;
    if (!c.isGameOver()) return false;
    const me = settingsRef.current?.userColor;
    if (c.isCheckmate()) {
      const winner: Color = c.turn() === 'w' ? 'b' : 'w';
      finish(winner === me ? 'Chiếu hết — bạn thắng!' : 'Bạn bị chiếu hết.', winner);
    } else if (c.isStalemate()) finish('Hòa do hết nước đi (stalemate).', null);
    else if (c.isThreefoldRepetition()) finish('Hòa do lặp lại thế cờ 3 lần.', null);
    else if (c.isInsufficientMaterial()) finish('Hòa do không đủ quân để chiếu hết.', null);
    else finish('Hòa theo luật 50 nước.', null);
    return true;
  }

  async function opponentEngine(level: Level): Promise<StockfishClient> {
    if (!opponentRef.current) {
      opponentRef.current = StockfishClient.createSingleThread();
      opponentRef.current.catch(() => (opponentRef.current = null));
      configuredLevelRef.current = null;
    }
    const eng = await opponentRef.current;
    if (configuredLevelRef.current !== level.id) {
      await eng.configure(uciOptionsFor(level));
      configuredLevelRef.current = level.id;
    }
    return eng;
  }

  async function opponentTurn(gen: number) {
    const settings = settingsRef.current;
    if (!settings) return;
    setStatus('thinking');
    const level = getLevel(settings.levelId);
    const fen = chessRef.current.fen();
    const t0 = performance.now();
    try {
      const eng = await opponentEngine(level);
      const lines = await eng.analyze(fen, level.depth, level.mode === 'weak' ? level.multiPv : 1, level.moveTimeMs);
      if (gen !== genRef.current) return;
      const legal = chessRef.current.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
      const uci = pickMove(lines, legal, level);
      const wait = MIN_THINK_MS - (performance.now() - t0);
      if (wait > 0) await sleep(wait);
      if (gen !== genRef.current || !uci) return;
      const pm = applyMove(uciToMove(uci));
      if (!pm) return;
      coachOpponentMove(pm.ply, gen);
      if (checkGameOver()) return;
      setStatus('user');
      analysisFor(chessRef.current.fen()); // phân tích trước trong lúc bạn suy nghĩ
    } catch (e) {
      if (gen !== genRef.current) return;
      setStatus('user');
      setState((s) => ({ ...s, error: 'Máy đối thủ gặp lỗi: ' + (e as Error).message }));
    }
  }

  function reset(settings: PlaySettings, startedAt: number, undos = 0, hints = 0) {
    genRef.current++;
    chessRef.current = new Chess();
    movesRef.current = [];
    evalRef.current = new Map();
    hintStageRef.current = null;
    settingsRef.current = settings;
    countersRef.current = { undos, hints, startedAt };
    statusRef.current = 'user';
    setState({ ...initialState(), settings, status: 'user', undos, hints, startedAt });
  }

  // ---------- API cho giao diện ----------

  function start(settings: PlaySettings) {
    reset(settings, Date.now());
    const level = getLevel(settings.levelId);
    addMessage(
      infoMessage(
        'Bắt đầu ván mới',
        `Bạn cầm quân ${settings.userColor === 'w' ? 'Trắng' : 'Đen'}, đối thủ: ${level.label} (~${level.elo}). Mình sẽ nhận xét từng nước của bạn. Chúc may mắn!`,
      ),
    );
    persist();
    analysisFor(START_FEN);
    if (settings.userColor === 'b') opponentTurn(genRef.current);
  }

  function resume(saved: SavedGame) {
    reset(saved.settings, saved.startedAt, saved.undos, saved.hints);
    for (const u of saved.ucis) if (!applyMove(uciToMove(u))) break;
    const gen = genRef.current;
    movesRef.current.forEach((m) => (m.color === saved.settings.userColor ? undefined : coachOpponentMove(m.ply, gen)));
    // Chấm điểm lại các nước cũ (không hiện lời nhận xét để khỏi rối)
    movesRef.current.forEach((m) => evalFor(m.ply).then((ev) => storeEval(m.ply, ev, gen)).catch(() => undefined));
    addMessage(infoMessage('Tiếp tục ván', 'Đã khôi phục ván đang chơi.'));
    if (checkGameOver()) return;
    if (chessRef.current.turn() !== saved.settings.userColor) opponentTurn(gen);
    else analysisFor(chessRef.current.fen());
  }

  /** Người chơi đi 1 nước. Trả false nếu không hợp lệ. */
  function userMove(from: string, to: string, promotion?: string): boolean {
    const settings = settingsRef.current;
    if (!settings || statusRef.current !== 'user' || chessRef.current.turn() !== settings.userColor) return false;
    const pm = applyMove({ from, to, promotion });
    if (!pm) return false;
    hintStageRef.current = null;
    const gen = genRef.current;
    coachUserMove(pm.ply, gen);
    if (checkGameOver()) return true;
    opponentTurn(gen);
    return true;
  }

  /** Đi lại: quay về trước nước gần nhất của người chơi */
  function undo() {
    const settings = settingsRef.current;
    if (!settings || !movesRef.current.some((m) => m.color === settings.userColor)) return;
    genRef.current++;
    opponentRef.current?.then((e) => e.stop()).catch(() => undefined);
    while (movesRef.current.length) {
      const last = movesRef.current[movesRef.current.length - 1];
      chessRef.current.undo();
      movesRef.current = movesRef.current.slice(0, -1);
      evalRef.current.delete(last.ply);
      if (last.color === settings.userColor) break;
    }
    const len = movesRef.current.length;
    countersRef.current.undos++;
    hintStageRef.current = null;
    statusRef.current = 'user';
    setState((s) => ({
      ...s,
      moves: movesRef.current,
      evals: s.evals.slice(0, len),
      status: 'user',
      result: undefined,
      hint: undefined,
      undos: countersRef.current.undos,
      messages: [
        ...s.messages.filter((m) => m.ply == null || m.ply < len),
        infoMessage('Đi lại', 'Đã quay lại trước nước của bạn. Thử nước khác nhé!'),
      ],
    }));
    persist();
    analysisFor(chessRef.current.fen());
  }

  /** Gợi ý: lần 1 chỉ quân cần đi, lần 2 lộ nước cụ thể */
  async function hint() {
    if (statusRef.current !== 'user') return;
    const fen = chessRef.current.fen();
    const stage = hintStageRef.current?.fen === fen ? hintStageRef.current.stage + 1 : 1;
    hintStageRef.current = { fen, stage };
    const gen = genRef.current;
    const a = await analysisFor(fen);
    const best = a.lines[0]?.pv[0];
    if (!best || gen !== genRef.current || chessRef.current.fen() !== fen) return;
    countersRef.current.hints++;
    persist();
    addMessage(hintMessage(fen, best, stage >= 2));
    setState((s) => ({
      ...s,
      hints: countersRef.current.hints,
      hint: { square: best.slice(0, 2), uci: stage >= 2 ? best : undefined },
    }));
  }

  function resign() {
    const settings = settingsRef.current;
    if (!settings || statusRef.current === 'over') return;
    genRef.current++;
    opponentRef.current?.then((e) => e.stop()).catch(() => undefined);
    finish('Bạn đã đầu hàng.', settings.userColor === 'w' ? 'b' : 'w');
  }

  function newGame() {
    genRef.current++;
    opponentRef.current?.then((e) => e.stop()).catch(() => undefined);
    clearSaved();
    settingsRef.current = null;
    movesRef.current = [];
    statusRef.current = 'setup';
    setState(initialState());
  }

  /** Tạo PGN để mở màn hình Review; lưu sẵn kết quả phân tích để mở ngay */
  async function exportForReview(): Promise<{ pgn: string; id: string; userColor: Color }> {
    const settings = settingsRef.current!;
    const level = getLevel(settings.levelId);
    const c = new Chess();
    const me = getUsername() || 'Bạn';
    const bot = `Stockfish ${level.label} (~${level.elo})`;
    c.setHeader('Event', 'Cờ Review — Đấu với máy');
    c.setHeader('Date', new Date(countersRef.current.startedAt || Date.now()).toISOString().slice(0, 10).replace(/-/g, '.'));
    c.setHeader('White', settings.userColor === 'w' ? me : bot);
    c.setHeader('Black', settings.userColor === 'b' ? me : bot);
    for (const m of movesRef.current) c.move(uciToMove(m.uci));
    const winner = state.result?.winner;
    c.setHeader('Result', winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : state.result ? '1/2-1/2' : '*');
    const pgn = c.pgn();
    const id = 'play-' + hashString(`${countersRef.current.startedAt}|${pgn}`);
    try {
      const fens = [START_FEN, ...movesRef.current.map((m) => m.fenAfter)];
      const positions = await Promise.all(fens.map(analysisFor));
      await putCachedAnalysis(id, 12, positions, `Stockfish (huấn luyện viên, độ sâu ${COACH_DEPTH})`);
    } catch {
      /* không sao: Review sẽ tự phân tích lại */
    }
    return { pgn, id, userColor: settings.userColor };
  }

  return { state, start, resume, userMove, undo, hint, resign, newGame, exportForReview, analysisFor };
}
