import { useCallback, useEffect, useMemo, useState } from 'react';
import { explainLine } from '../../analysis/lineExplain';
import { ERROR_CLASSES } from '../../analysis/types';
import { negateScore } from '../../analysis/winProb';
import type { EngineScore } from '../../engine/stockfishClient';
import type { ParsedGame } from '../../game/parseGame';
import { useGameAnalysis } from '../../hooks/useGameAnalysis';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';
import type { DepthPreset } from '../../storage/prefs';
import { formatEval, moveNumber } from '../classMeta';
import DepthPicker from '../DepthPicker';
import BoardPanel, { type BoardArrow, type PlayerBarInfo } from './BoardPanel';
import EvalChart from './EvalChart';
import LineViewer, { type ActiveLine } from './LineViewer';
import MoveExplain, { type LineKind } from './MoveExplain';
import MoveList from './MoveList';
import NavControls from './NavControls';
import SummaryPanel from './SummaryPanel';

const toWhite = (s: EngineScore, sideToMove: 'w' | 'b') => (sideToMove === 'w' ? s : negateScore(s));

export default function ReviewPage({
  game,
  myColor,
  depth,
  onDepthChange,
  onBack,
}: {
  game: ParsedGame;
  myColor: 'w' | 'b';
  depth: DepthPreset;
  onDepthChange: (d: DepthPreset) => void;
  onBack: () => void;
}) {
  const [pos, setPos] = useState(0);
  const [hint, setHint] = useState(false);
  const [flipped, setFlipped] = useState(false);
  /** Biến đang diễn lại (null = đang xem ván thật) */
  const [line, setLine] = useState<ActiveLine | null>(null);
  const { state, reanalyze } = useGameAnalysis(game, depth);
  const review = state.status === 'done' ? state.review : undefined;
  const max = game.moves.length;

  useEffect(() => {
    setPos(0);
    setLine(null);
  }, [game]);

  const select = useCallback(
    (p: number) => {
      setLine(null);
      setPos(Math.max(0, Math.min(max, p)));
    },
    [max],
  );

  const stepLine = useCallback(
    (n: number) => setLine((l) => (l ? { ...l, step: Math.max(0, Math.min(l.exp.steps.length, n)) } : l)),
    [],
  );

  const inLine = line != null;
  const nav = useMemo(
    () =>
      inLine
        ? {
            prev: () => setLine((l) => (l ? { ...l, step: Math.max(0, l.step - 1) } : l)),
            next: () => setLine((l) => (l ? { ...l, step: Math.min(l.exp.steps.length, l.step + 1) } : l)),
            first: () => setLine((l) => (l ? { ...l, step: 0 } : l)),
            last: () => setLine((l) => (l ? { ...l, step: l.exp.steps.length } : l)),
          }
        : {
            prev: () => setPos((p) => Math.max(0, p - 1)),
            next: () => setPos((p) => Math.min(max, p + 1)),
            first: () => setPos(0),
            last: () => setPos(max),
          },
    [max, inLine],
  );
  useKeyboardNav(nav);

  const raw = game.moves[pos - 1];
  const move = review?.moves[pos - 1];
  const nextMove = review?.moves[pos];
  const orientation: 'white' | 'black' = (myColor === 'w') !== flipped ? 'white' : 'black';

  /** Mở chế độ diễn lại biến: sau nước đã đi, hoặc nếu đi nước tốt nhất */
  const showLine = (kind: LineKind) => {
    if (!review || !move) return;
    const before = review.positions[pos - 1]?.lines[0];
    const after = review.positions[pos]?.lines[0];
    const opp = move.color === 'w' ? 'b' : 'w';
    if (kind === 'played') {
      const exp = explainLine(move.fenBefore, [move.uci, ...(after?.pv ?? [])], myColor, 11);
      setLine({
        kind,
        title: `Diễn biến sau ${moveNumber(move.ply)} ${move.san}`,
        exp,
        engineEval: formatEval(after ? toWhite(after.score, opp) : move.evalAfter),
        step: 1,
      });
    } else {
      const exp = explainLine(move.fenBefore, before?.pv ?? [], myColor, 10);
      setLine({
        kind,
        title: `Nếu đi ${move.bestSan} thay vì ${move.san}`,
        exp,
        engineEval: before ? formatEval(toWhite(before.score, move.color)) : undefined,
        step: 0,
      });
    }
  };

  // Thế cờ trên bàn: của ván thật, hoặc của biến đang diễn lại
  const lineStep = line && line.step > 0 ? line.exp.steps[line.step - 1] : undefined;
  const fen = line ? (lineStep?.fen ?? line.exp.startFen) : pos === 0 ? game.startFen : game.moves[pos - 1].fenAfter;
  const lastMove = line
    ? lineStep && { from: lineStep.uci.slice(0, 2), to: lineStep.uci.slice(2, 4) }
    : raw && { from: raw.uci.slice(0, 2), to: raw.uci.slice(2, 4), classification: move?.classification };

  const arrows = useMemo(() => {
    const out: BoardArrow[] = [];
    if (line) {
      // Mũi tên xanh dương: nước tiếp theo trong biến
      const next = line.exp.steps[line.step];
      if (next) out.push({ startSquare: next.uci.slice(0, 2), endSquare: next.uci.slice(2, 4), color: '#5a8dee' });
      return out;
    }
    // Nước tốt nhất lẽ ra nên đi (khi nước đã đi không phải nước engine)
    if (move?.bestUci && move.bestUci !== move.uci && move.classification !== 'book') {
      out.push({ startSquare: move.bestUci.slice(0, 2), endSquare: move.bestUci.slice(2, 4), color: '#80b64b' });
    }
    // Gợi ý: nước tốt nhất ở thế cờ hiện tại
    if (hint && nextMove?.bestUci) {
      out.push({ startSquare: nextMove.bestUci.slice(0, 2), endSquare: nextMove.bestUci.slice(2, 4), color: '#f2b84b' });
    }
    return out;
  }, [move, nextMove, hint, line]);

  const nextMistake = useMemo(() => {
    const m = review?.moves.find((x) => x.ply >= pos && x.color === myColor && ERROR_CLASSES.includes(x.classification));
    return m ? m.ply + 1 : null;
  }, [review, pos, myColor]);

  const playerInfo = (c: 'w' | 'b'): PlayerBarInfo => {
    const p = c === 'w' ? game.white : game.black;
    return {
      name: p.name,
      elo: p.elo,
      color: c,
      isMe: c === myColor,
      accuracy: review ? (c === 'w' ? review.accuracy.white : review.accuracy.black) : undefined,
    };
  };
  const bottomColor = orientation === 'white' ? 'w' : 'b';

  const status =
    state.status === 'analyzing'
      ? `Đang phân tích… ${state.done}/${state.total}`
      : state.status === 'error'
        ? 'Lỗi phân tích'
        : 'Đang tải…';

  return (
    <div className="review">
      <div className="review-main">
        <BoardPanel
          fen={fen}
          orientation={orientation}
          lastMove={lastMove || undefined}
          arrows={arrows}
          winPct={review ? review.whiteWinPcts[pos] : 50}
          score={review?.whiteEvals[pos]}
          top={playerInfo(bottomColor === 'w' ? 'b' : 'w')}
          bottom={playerInfo(bottomColor)}
        />
        {line ? (
          <div className="line-banner">
            <span>Đang xem biến của engine (không phải ván thật)</span>
            <button className="btn ghost small" onClick={() => setLine(null)}>
              Quay lại ván
            </button>
          </div>
        ) : (
          <NavControls
            pos={pos}
            max={max}
            onSelect={select}
            nextMistake={nextMistake}
            hint={hint}
            onToggleHint={() => setHint((h) => !h)}
            onFlip={() => setFlipped((f) => !f)}
          />
        )}
      </div>

      <aside className="review-side">
        <div className="card side-head">
          <div className="side-title">
            <button className="btn ghost small" onClick={onBack}>
              ← Danh sách ván
            </button>
            {review?.opening && (
              <span className="opening" title={review.opening.name}>
                {review.opening.eco} · {review.opening.name}
              </span>
            )}
          </div>
          <div className="side-controls">
            <DepthPicker value={depth} onChange={onDepthChange} disabled={state.status === 'analyzing'} />
            {state.status === 'done' && (
              <button className="btn ghost small" onClick={reanalyze} title="Bỏ qua cache và phân tích lại">
                Phân tích lại
              </button>
            )}
          </div>
          {state.status === 'done' && (
            <p className="muted small">
              Độ sâu {state.depth}
              {state.fromCache ? ' · đã lưu trên máy' : ''}
            </p>
          )}
        </div>

        {state.status === 'analyzing' && (
          <div className="card progress-card" aria-live="polite">
            <div className="progress-label">
              <span>Stockfish đang phân tích…</span>
              <span>
                {state.done}/{state.total}
              </span>
            </div>
            <div className="progress">
              <div className="progress-fill" style={{ width: `${(state.done / Math.max(1, state.total)) * 100}%` }} />
            </div>
          </div>
        )}
        {state.status === 'error' && (
          <div className="card error-card">
            <p className="error">{state.message}</p>
            <button className="btn primary" onClick={reanalyze}>
              Thử lại
            </button>
          </div>
        )}

        {line ? (
          <LineViewer line={line} onStep={stepLine} onClose={() => setLine(null)} />
        ) : (
          <MoveExplain
            move={move}
            nextMove={nextMove}
            pos={pos}
            status={status}
            myColor={myColor}
            positions={review?.positions}
            onShowLine={showLine}
          />
        )}
        {review && <EvalChart winPcts={review.whiteWinPcts} moves={review.moves} pos={pos} onSelect={select} />}
        <MoveList moves={game.moves} reviews={review?.moves} pos={pos} onSelect={select} />
        {review && <SummaryPanel review={review} game={game} myColor={myColor} />}
      </aside>
    </div>
  );
}
