import type { MoveReview } from '../../analysis/review';
import type { Classification } from '../../analysis/types';
import { CLASS_META, moveNumber } from '../classMeta';

const MARKED: Classification[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const W = 600;
const H = 120;

/** Biểu đồ lợi thế cả ván (vùng sáng = lợi thế Trắng). Bấm để nhảy tới nước tương ứng. */
export default function EvalChart({
  winPcts,
  moves,
  pos,
  onSelect,
}: {
  winPcts: number[];
  moves: MoveReview[];
  pos: number;
  onSelect: (pos: number) => void;
}) {
  const n = Math.max(1, winPcts.length - 1);
  const x = (i: number) => (i / n) * W;
  const y = (w: number) => (1 - w / 100) * H;
  const pts = winPcts.map((w, i) => `${x(i).toFixed(1)},${y(w).toFixed(1)}`);
  const area = `M0,${H} L${pts.join(' L')} L${W},${H} Z`;
  const line = `M${pts.join(' L')}`;

  const pick = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onSelect(Math.round(ratio * n));
  };

  return (
    <div
      className="eval-chart"
      onClick={(e) => pick(e.clientX, e.currentTarget)}
      role="slider"
      tabIndex={0}
      aria-label="Biểu đồ lợi thế — bấm để nhảy tới nước"
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={pos}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <rect width={W} height={H} className="chart-bg" />
        <path d={area} className="chart-area" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="chart-mid" />
        <path d={line} className="chart-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-cursor" style={{ left: `${(pos / n) * 100}%` }} />
      {moves
        .filter((m) => MARKED.includes(m.classification))
        .map((m) => (
          <button
            key={m.ply}
            className="chart-dot"
            style={{
              left: `${((m.ply + 1) / n) * 100}%`,
              top: `${(y(winPcts[m.ply + 1] ?? 50) / H) * 100}%`,
              background: CLASS_META[m.classification].color,
            }}
            title={`${moveNumber(m.ply)} ${m.san} — ${CLASS_META[m.classification].label}`}
            aria-label={`${moveNumber(m.ply)} ${m.san} — ${CLASS_META[m.classification].label}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m.ply + 1);
            }}
          />
        ))}
    </div>
  );
}
