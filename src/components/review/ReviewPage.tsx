import { useCallback, useEffect, useMemo, useState } from 'react';
import { ERROR_CLASSES } from '../../analysis/types';
import type { ParsedGame } from '../../game/parseGame';
import { useGameAnalysis } from '../../hooks/useGameAnalysis';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';
import type { DepthPreset } from '../../storage/prefs';
import DepthPicker from '../DepthPicker';
import BoardPanel, { type BoardArrow, type PlayerBarInfo } from './BoardPanel';
import EvalChart from './EvalChart';
import MoveExplain from './MoveExplain';
import MoveList from './MoveList';
import NavControls from './NavControls';
import SummaryPanel from './SummaryPanel';

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
  const { state, reanalyze } = useGameAnalysis(game, depth);
  const review = state.status === 'done' ? state.review : undefined;
  const max = game.moves.length;

  useEffect(() => setPos(0), [game]);

  const select = useCallback((p: number) => setPos(Math.max(0, Math.min(max, p))), [max]);
  const nav = useMemo(
    () => ({
      prev: () => setPos((p) => Math.max(0, p - 1)),
      next: () => setPos((p) => Math.min(max, p + 1)),
      first: () => setPos(0),
      last: () => setPos(max),
    }),
    [max],
  );
  useKeyboardNav(nav);

  const fen = pos === 0 ? game.startFen : game.moves[pos - 1].fenAfter;
  const raw = game.moves[pos - 1];
  const move = review?.moves[pos - 1];
  const nextMove = review?.moves[pos];
  const orientation: 'white' | 'black' = (myColor === 'w') !== flipped ? 'white' : 'black';

  const arrows = useMemo(() => {
    const out: BoardArrow[] = [];
    // Nước tốt nhất lẽ ra nên đi (khi nước đã đi không phải nước engine)
    if (move?.bestUci && move.bestUci !== move.uci && move.classification !== 'book') {
      out.push({ startSquare: move.bestUci.slice(0, 2), endSquare: move.bestUci.slice(2, 4), color: '#80b64b' });
    }
    // Gợi ý: nước tốt nhất ở thế cờ hiện tại
    if (hint && nextMove?.bestUci) {
      out.push({ startSquare: nextMove.bestUci.slice(0, 2), endSquare: nextMove.bestUci.slice(2, 4), color: '#f2b84b' });
    }
    return out;
  }, [move, nextMove, hint]);

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
          lastMove={raw ? { from: raw.uci.slice(0, 2), to: raw.uci.slice(2, 4), classification: move?.classification } : undefined}
          arrows={arrows}
          winPct={review ? review.whiteWinPcts[pos] : 50}
          score={review?.whiteEvals[pos]}
          top={playerInfo(bottomColor === 'w' ? 'b' : 'w')}
          bottom={playerInfo(bottomColor)}
        />
        <NavControls
          pos={pos}
          max={max}
          onSelect={select}
          nextMistake={nextMistake}
          hint={hint}
          onToggleHint={() => setHint((h) => !h)}
          onFlip={() => setFlipped((f) => !f)}
        />
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

        <MoveExplain move={move} nextMove={nextMove} pos={pos} status={status} />
        {review && <EvalChart winPcts={review.whiteWinPcts} moves={review.moves} pos={pos} onSelect={select} />}
        <MoveList moves={game.moves} reviews={review?.moves} pos={pos} onSelect={select} />
        {review && <SummaryPanel review={review} game={game} myColor={myColor} />}
      </aside>
    </div>
  );
}
