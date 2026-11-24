import { formatSans, materialSwing } from '../../analysis/lineExplain';
import type { MoveReview, PositionEval } from '../../analysis/review';
import type { Classification } from '../../analysis/types';
import { negateScore } from '../../analysis/winProb';
import type { EngineScore } from '../../engine/stockfishClient';
import { describeMissed, describeThreat } from '../../play/coach';
import { CLASS_META, ClassIcon, formatEval, moveNumber } from '../classMeta';

const EXTRA: Partial<Record<Classification, string>> = {
  brilliant: 'Thí quân đúng lúc — engine xác nhận đây là nước rất mạnh!',
  great: 'Nước duy nhất giữ được thế cờ.',
  miss: 'Đối thủ vừa đi sai nhưng nước này chưa tận dụng được.',
};

const BAD: Classification[] = ['inaccuracy', 'mistake', 'blunder', 'miss'];

export type LineKind = 'played' | 'best';

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

const toWhite = (s: EngineScore, mover: 'w' | 'b') => (mover === 'w' ? s : negateScore(s));
const pct = (ep: number) => `${Math.round(ep * 100)}%`;

/** Lý do cụ thể cho nước sai: mất quân / bị chiếu hết / bỏ lỡ đòn */
function reasonsFor(move: MoveReview, before?: PositionEval, after?: PositionEval, isMine?: boolean): string[] {
  if (!BAD.includes(move.classification)) return [];
  const out: string[] = [];
  const opp = isMine ? 'đối thủ' : 'bên kia';
  const threat = describeThreat(move.fenAfter, after?.lines[0]);
  if (threat?.kind === 'mate') out.push(`Sau ${move.san}, ${opp} có thể chiếu hết trong ${threat.moves} nước, bắt đầu bằng ${threat.san}.`);
  else if (threat?.kind === 'wins') out.push(`${move.san} để mất ${threat.piece} ở ${threat.square}: ${opp} có thể đi ${threat.san}.`);
  const subject = isMine ? 'bạn' : 'bên đi';

  // Không mất quân ngay → nhìn trước ~6 nước theo biến của engine
  if (!threat && after?.lines[0]?.pv.length) {
    const sw = materialSwing(move.fenAfter, after.lines[0].pv, move.color);
    if (sw.diff <= -2 && sw.ownLost) {
      out.push(
        `Sau ${move.san}, ${opp} có đòn: ${formatSans(sw.startPly, sw.sans)} — trong ${Math.ceil(sw.sans.length / 2)} nước ${subject} sẽ mất ${sw.ownLost}${sw.oppLost ? ` (đổi lại chỉ được ${sw.oppLost})` : ''}.`,
      );
    }
  }

  const missed = describeMissed(move.fenBefore, before?.lines[0]);
  if (missed?.kind === 'mate') out.push(`Đã bỏ lỡ nước chiếu hết: ${missed.line}.`);
  else if (missed?.kind === 'capture') out.push(`Đã bỏ lỡ cơ hội ăn ${missed.piece} bằng ${missed.san}.`);
  else if (before?.lines[0]?.pv.length && move.bestSan) {
    // Nước tốt nhất có lời quân sau vài nước không?
    const sw = materialSwing(move.fenBefore, before.lines[0].pv, move.color);
    if (sw.diff >= 2 && sw.oppLost) out.push(`Nếu đi ${move.bestSan}, sau vài nước ${subject} sẽ ăn được ${sw.oppLost}: ${formatSans(sw.startPly, sw.sans)}.`);
  }

  if (out.length === 0 && move.classification !== 'inaccuracy')
    out.push('Không mất quân, nhưng thế cờ xấu đi (vị trí quân, an toàn của Vua…) — bấm "Diễn biến" bên dưới để xem engine thấy gì.');
  return out;
}

export default function MoveExplain({
  move,
  nextMove,
  pos,
  status,
  myColor,
  positions,
  onShowLine,
}: {
  move?: MoveReview;
  nextMove?: MoveReview;
  pos: number;
  status: string;
  myColor: 'w' | 'b';
  positions?: PositionEval[];
  onShowLine: (kind: LineKind) => void;
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
  const before = positions?.[pos - 1];
  const after = positions?.[pos];
  const isMine = move.color === myColor;
  const who = isMine ? 'Bạn' : 'Đối thủ';
  const reasons = reasonsFor(move, before, after, isMine);
  const bestScore = before?.lines[0] ? toWhite(before.lines[0].score, move.color) : undefined;
  const hasBestLine = !!before?.lines[0]?.pv.length;

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

      {reasons.length > 0 && (
        <div className="why">
          <span className="why-title">Vì sao?</span>
          {reasons.map((r, i) => (
            <p key={i}>{r}</p>
          ))}
        </div>
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

      {!playedBest && move.bestSan && move.classification !== 'book' && (
        <div className="compare">
          <div className="cmp-row best">
            <span>
              Nếu đi <b>{move.bestSan}</b>
            </span>
            <span className="cmp-eval">{formatEval(bestScore)}</span>
            <span className="cmp-pct" title={`Cơ hội của ${who.toLowerCase()} theo engine`}>
              {who}: {pct(move.epBest)}
            </span>
          </div>
          <div className="cmp-row played">
            <span>
              Đã đi <b>{move.san}</b>
            </span>
            <span className="cmp-eval">{formatEval(move.evalAfter)}</span>
            <span className="cmp-pct">
              {who}: {pct(move.epPlayed)}
            </span>
          </div>
          <p className="muted small">
            Điểm: dương = Trắng hơn, âm = Đen hơn (1.0 ≈ hơn 1 Tốt). % = cơ hội thắng ước tính của {who.toLowerCase()}.
          </p>
        </div>
      )}

      {move.classification !== 'book' && (
        <div className="line-buttons">
          <button className="btn small" onClick={() => onShowLine('played')}>
            ▶ Diễn biến sau {move.san}
          </button>
          {!playedBest && hasBestLine && (
            <button className="btn small best-btn" onClick={() => onShowLine('best')}>
              ▶ Nếu đi {move.bestSan}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
