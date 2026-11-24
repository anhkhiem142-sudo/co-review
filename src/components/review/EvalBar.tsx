import type { EngineScore } from '../../engine/stockfishClient';
import { formatEval } from '../classMeta';

/** Thanh lợi thế dọc. winPct = Win% của Trắng (0..100). */
export default function EvalBar({ winPct, score, flipped }: { winPct: number; score?: EngineScore; flipped: boolean }) {
  const white = Math.min(98, Math.max(2, winPct));
  const whiteAtBottom = !flipped;
  const textAtBottom = winPct >= 50 === whiteAtBottom;
  return (
    <div
      className={`eval-bar ${flipped ? 'flipped' : ''}`}
      role="meter"
      aria-label="Lợi thế"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(winPct)}
      aria-valuetext={formatEval(score)}
    >
      <div className="eval-white" style={{ height: `${white}%` }} />
      <span className={`eval-text ${textAtBottom ? 'bottom' : 'top'} ${winPct >= 50 ? 'on-white' : 'on-black'}`}>
        {formatEval(score)}
      </span>
    </div>
  );
}
