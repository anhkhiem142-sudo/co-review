import { useMemo, type CSSProperties, type JSX } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Classification } from '../../analysis/types';
import type { EngineScore } from '../../engine/stockfishClient';
import { CLASS_META, ClassIcon } from '../classMeta';
import EvalBar from './EvalBar';

export interface PlayerBarInfo {
  name: string;
  elo?: number;
  color: 'w' | 'b';
  accuracy?: number;
  isMe: boolean;
}

export interface BoardArrow {
  startSquare: string;
  endSquare: string;
  color: string;
}

function PlayerBar({ p }: { p: PlayerBarInfo }) {
  return (
    <div className="player-bar">
      <span className={`avatar ${p.color === 'w' ? 'white' : 'black'}`} aria-hidden>
        {p.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="pb-name">{p.name}</span>
      {p.elo != null && <span className="muted">({p.elo})</span>}
      {p.isMe && <span className="you">Bạn</span>}
      {p.accuracy != null && <span className="pb-acc">{p.accuracy.toFixed(1)}</span>}
    </div>
  );
}

export default function BoardPanel({
  fen,
  orientation,
  lastMove,
  arrows,
  winPct,
  score,
  top,
  bottom,
}: {
  fen: string;
  orientation: 'white' | 'black';
  lastMove?: { from: string; to: string; classification?: Classification };
  arrows: BoardArrow[];
  winPct: number;
  score?: EngineScore;
  top: PlayerBarInfo;
  bottom: PlayerBarInfo;
}) {
  const squareStyles = useMemo(() => {
    if (!lastMove) return {};
    const color = lastMove.classification ? CLASS_META[lastMove.classification].color : '#f2b84b';
    const s: CSSProperties = { backgroundColor: `${color}66` };
    return { [lastMove.from]: s, [lastMove.to]: s } as Record<string, CSSProperties>;
  }, [lastMove]);

  const options = useMemo(
    () => ({
      id: 'review-board',
      position: fen,
      boardOrientation: orientation,
      allowDragging: false,
      arrows,
      squareStyles,
      darkSquareStyle: { backgroundColor: '#7d8fa8' },
      lightSquareStyle: { backgroundColor: '#e4e9f0' },
      darkSquareNotationStyle: { color: '#e4e9f0' },
      lightSquareNotationStyle: { color: '#7d8fa8' },
      animationDurationInMs: 160,
      // Gắn icon phân loại lên ô đích của nước vừa đi
      squareRenderer: ({ square, children }: { square: string; children?: React.ReactNode }) =>
        lastMove?.classification && square === lastMove.to ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', ...squareStyles[square] }}>
            {children}
            <span className="sq-badge">
              <ClassIcon c={lastMove.classification} size={22} />
            </span>
          </div>
        ) : (
          (undefined as unknown as JSX.Element)
        ),
    }),
    [fen, orientation, arrows, squareStyles, lastMove],
  );

  return (
    <div className="board-panel">
      <PlayerBar p={top} />
      <div className="board-row">
        <EvalBar winPct={winPct} score={score} flipped={orientation === 'black'} />
        <div className="board-wrap">
          <Chessboard options={options} />
        </div>
      </div>
      <PlayerBar p={bottom} />
    </div>
  );
}
