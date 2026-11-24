import { useMemo, useState, type CSSProperties, type JSX } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Classification } from '../../analysis/types';
import { CLASS_META, ClassIcon } from '../classMeta';

const PROMO = [
  ['q', 'Hậu'],
  ['r', 'Xe'],
  ['b', 'Tượng'],
  ['n', 'Mã'],
] as const;

/** Bàn cờ tương tác: kéo-thả hoặc bấm ô để đi, có chọn quân phong cấp */
export default function PlayBoard({
  fen,
  orientation,
  canMove,
  userColor,
  lastMove,
  hint,
  onMove,
}: {
  fen: string;
  orientation: 'white' | 'black';
  canMove: boolean;
  userColor: 'w' | 'b';
  lastMove?: { from: string; to: string; classification?: Classification };
  hint?: { square: string; uci?: string };
  onMove: (from: string, to: string, promotion?: string) => boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);
  const targets = useMemo(
    () => (selected ? chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string) : []),
    [chess, selected],
  );

  const isPromotion = (from: string, to: string) => {
    const p = chess.get(from as Square);
    return p?.type === 'p' && (to[1] === '8' || to[1] === '1');
  };

  const tryMove = (from: string, to: string): boolean => {
    if (!canMove) return false;
    const legal = chess.moves({ square: from as Square, verbose: true }).some((m) => m.to === to);
    if (!legal) return false;
    if (isPromotion(from, to)) {
      setPromo({ from, to });
      setSelected(null);
      return false;
    }
    setSelected(null);
    return onMove(from, to);
  };

  const squareStyles = useMemo(() => {
    const s: Record<string, CSSProperties> = {};
    if (lastMove) {
      const color = lastMove.classification ? CLASS_META[lastMove.classification].color : '#f2b84b';
      s[lastMove.from] = s[lastMove.to] = { backgroundColor: `${color}66` };
    }
    if (hint) s[hint.square] = { ...s[hint.square], boxShadow: 'inset 0 0 0 4px #f2b84b' };
    if (selected) s[selected] = { ...s[selected], backgroundColor: 'rgba(242,184,75,0.55)' };
    for (const t of targets) {
      const occupied = !!chess.get(t as Square);
      s[t] = {
        ...s[t],
        backgroundImage: occupied
          ? 'radial-gradient(circle, transparent 58%, rgba(20,22,27,0.45) 60%)'
          : 'radial-gradient(circle, rgba(20,22,27,0.38) 22%, transparent 24%)',
      };
    }
    return s;
  }, [lastMove, hint, selected, targets, chess]);

  const arrows = useMemo(
    () => (hint?.uci ? [{ startSquare: hint.uci.slice(0, 2), endSquare: hint.uci.slice(2, 4), color: '#f2b84b' }] : []),
    [hint],
  );

  const options = {
    id: 'play-board',
    position: fen,
    boardOrientation: orientation,
    allowDragging: canMove,
    arrows,
    squareStyles,
    darkSquareStyle: { backgroundColor: '#7d8fa8' },
    lightSquareStyle: { backgroundColor: '#e4e9f0' },
    darkSquareNotationStyle: { color: '#e4e9f0' },
    lightSquareNotationStyle: { color: '#7d8fa8' },
    animationDurationInMs: 160,
    canDragPiece: ({ piece }: { piece: { pieceType: string } }) => canMove && piece.pieceType[0] === userColor,
    onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) =>
      !!targetSquare && tryMove(sourceSquare, targetSquare),
    onSquareClick: ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      if (!canMove) return;
      if (selected && targets.includes(square)) {
        tryMove(selected, square);
        return;
      }
      if (piece && piece.pieceType[0] === userColor) setSelected(square === selected ? null : square);
      else setSelected(null);
    },
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
  };

  return (
    <div className="board-wrap play-board">
      <Chessboard options={options} />
      {promo && (
        <div className="promo-overlay" role="dialog" aria-label="Chọn quân phong cấp">
          <div className="promo-box">
            <strong>Phong cấp thành</strong>
            <div className="promo-choices">
              {PROMO.map(([p, label]) => (
                <button
                  key={p}
                  className="btn"
                  onClick={() => {
                    const { from, to } = promo;
                    setPromo(null);
                    onMove(from, to, p);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="btn ghost small" onClick={() => setPromo(null)}>
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
