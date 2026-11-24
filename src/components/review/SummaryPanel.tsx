import type { GameReview } from '../../analysis/review';
import { CLASSIFICATION_ORDER, type Classification } from '../../analysis/types';
import type { ParsedGame } from '../../game/parseGame';
import { CLASS_META, ClassIcon } from '../classMeta';

export default function SummaryPanel({
  review,
  game,
  myColor,
}: {
  review: GameReview;
  game: ParsedGame;
  myColor: 'w' | 'b';
}) {
  const counts = { w: {} as Record<Classification, number>, b: {} as Record<Classification, number> };
  for (const m of review.moves) counts[m.color][m.classification] = (counts[m.color][m.classification] ?? 0) + 1;

  const player = (c: 'w' | 'b') => {
    const p = c === 'w' ? game.white : game.black;
    const acc = c === 'w' ? review.accuracy.white : review.accuracy.black;
    return (
      <div className={`acc-player ${c === myColor ? 'me' : ''}`}>
        <span className="acc-name">
          <span className={`color-dot ${c === 'w' ? 'white' : 'black'}`} aria-hidden />
          {p.name}
          {c === myColor && <span className="you">Bạn</span>}
        </span>
        <span className="acc-value">{acc.toFixed(1)}</span>
        <span className="muted small">Độ chính xác</span>
      </div>
    );
  };

  return (
    <div className="card summary">
      <h3>Tổng kết</h3>
      <div className="acc-row">
        {player('w')}
        {player('b')}
      </div>
      <table className="class-table">
        <tbody>
          {CLASSIFICATION_ORDER.map((c) => (
            <tr key={c}>
              <td className="ct-count" style={{ color: counts.w[c] ? CLASS_META[c].color : undefined }}>
                {counts.w[c] ?? 0}
              </td>
              <td className="ct-label">
                <ClassIcon c={c} size={18} />
                {CLASS_META[c].label}
              </td>
              <td className="ct-count" style={{ color: counts.b[c] ? CLASS_META[c].color : undefined }}>
                {counts.b[c] ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
