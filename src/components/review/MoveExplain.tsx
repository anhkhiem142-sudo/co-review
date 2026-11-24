import type { MoveReview } from '../../analysis/review';
import type { Classification } from '../../analysis/types';
import { CLASS_META, ClassIcon, formatEval, moveNumber } from '../classMeta';

const EXTRA: Partial<Record<Classification, string>> = {
  brilliant: 'Thí quân đúng lúc — engine xác nhận đây là nước rất mạnh!',
  great: 'Nước duy nhất giữ được thế cờ.',
  miss: 'Đối thủ vừa đi sai nhưng bạn chưa tận dụng được.',
  blunder: 'Nước này làm thay đổi cục diện ván đấu.',
};

/** "12. Nf3 Nc6 13. Bb5" bắt đầu từ ply cho trước */
export function formatPv(startPly: number, sans: string[]): string {
  return sans
    .map((san, i) => {
      const ply = startPly + i;
      if (ply % 2 === 0) return `${Math.floor(ply / 2) + 1}. ${san}`;
      return i === 0 ? `${Math.floor(ply / 2) + 1}… ${san}` : san;
    })
    .join(' ');
}

export default function MoveExplain({
  move,
  nextMove,
  pos,
  status,
}: {
  move?: MoveReview;
  nextMove?: MoveReview;
  pos: number;
  status: string;
}) {
  if (pos === 0 || !move) {
    return (
      <div className="card explain">
        <div className="explain-head">
          <strong>{pos === 0 ? 'Thế cờ ban đầu' : status}</strong>
        </div>
        {pos === 0 && nextMove?.bestSan && (
          <p className="explain-line">
            Nước tốt nhất là <b>{nextMove.bestSan}</b>, biến chính: <span className="pv">{formatPv(0, nextMove.bestPvSan)}</span>
          </p>
        )}
        {pos === 0 && <p className="muted small">Dùng phím ← → để tua từng nước, Home / End để về đầu / cuối ván.</p>}
      </div>
    );
  }

  const meta = CLASS_META[move.classification];
  const playedBest = move.bestUci === move.uci;
  return (
    <div className="card explain" style={{ borderColor: meta.color }}>
      <div className="explain-head">
        <ClassIcon c={move.classification} size={26} />
        <span>
          <b>
            {moveNumber(move.ply)} {move.san}
          </b>{' '}
          là nước <b style={{ color: meta.color }}>{meta.label.toLowerCase()}</b>
        </span>
        <span className="eval-chip">{formatEval(move.evalAfter)}</span>
      </div>

      {move.classification === 'book' && move.opening && (
        <p className="explain-line">
          {move.opening.eco} · {move.opening.name}
        </p>
      )}
      {EXTRA[move.classification] && <p className="explain-line">{EXTRA[move.classification]}</p>}
      {move.loss >= 0.005 && move.classification !== 'book' && (
        <p className="explain-line muted">Làm mất {(move.loss * 100).toFixed(1)}% khả năng thắng.</p>
      )}
      {move.bestSan && (
        <p className="explain-line">
          {playedBest ? (
            <>Đây chính là nước tốt nhất của engine, biến chính: </>
          ) : (
            <>
              Nước tốt nhất là <b className="best-san">{move.bestSan}</b>, biến chính:{' '}
            </>
          )}
          <span className="pv">{formatPv(move.ply, move.bestPvSan)}</span>
        </p>
      )}
    </div>
  );
}
