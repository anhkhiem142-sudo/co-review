import { explainLine, formatSans, materialSwing } from '../../analysis/lineExplain';
import type { MoveReview, PositionEval } from '../../analysis/review';
import type { Classification } from '../../analysis/types';
import { negateScore } from '../../analysis/winProb';
import type { EngineScore } from '../../engine/stockfishClient';
import { capturedBy, describeMissed, describeThreat } from '../../play/coach';
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
export function reasonsFor(move: MoveReview, before?: PositionEval, after?: PositionEval, isMine?: boolean): string[] {
  if (!BAD.includes(move.classification)) return [];
  const out: string[] = [];
  const opp = isMine ? 'đối thủ' : 'bên kia';
  const threat = describeThreat(move.fenAfter, after?.lines[0], capturedBy(move.fenBefore, move.uci));
  if (threat?.kind === 'mate') out.push(`Sau ${move.san}, ${opp} có thể chiếu hết trong ${threat.moves} nước, bắt đầu bằng ${threat.san}.`);
  else if (threat?.kind === 'wins') out.push(`${move.san} để mất ${threat.piece} ở ${threat.square}: ${opp} có thể đi ${threat.san}.`);
  const subject = isMine ? 'bạn' : 'bên đi';

  // So sánh kết quả quân số của 2 lựa chọn (cùng cách tính như nút "Diễn biến":
  // theo biến engine tới lúc kết quả ngã ngũ)
  const played = after?.lines[0] ? materialSwing(move.fenBefore, [move.uci, ...after.lines[0].pv], move.color) : undefined;
  const best = before?.lines[0]?.pv.length ? materialSwing(move.fenBefore, before.lines[0].pv, move.color) : undefined;
  const fmt = (d: number) => (d > 0 ? `lời ${d}` : d < 0 ? `thiệt ${-d}` : 'hòa vốn');
  /** Chuỗi nước ngắn gọn trong câu giải thích (bản đầy đủ xem ở khung Diễn biến) */
  const short = (startPly: number, sans: string[]) => formatSans(startPly, sans.slice(0, 8)) + (sans.length > 8 ? ' …' : '');
  /** "sau 5 nước" — số nước tới lúc kết quả lộ rõ */
  const within = (sw: typeof played) => (sw?.keyPlies ? `sau ${sw.keyPlies} nước` : 'sau cả biến');

  // Không mất quân ngay nhưng có đòn mất quân sau vài nước
  if (!threat && played && played.diff <= -2 && played.ownLost) {
    const upto = played.keyPlies ?? played.sans.length;
    out.push(
      `Sau ${move.san}, ${opp} có đòn: ${short(played.startPly + 1, played.sans.slice(1, upto))} — ${within(played)} ${subject} mất ${played.ownLost}${played.oppLost ? ` (đổi lại chỉ được ${played.oppLost})` : ''}.`,
    );
  }

  const missed = describeMissed(move.fenBefore, before?.lines[0]);
  if (missed?.kind === 'mate') out.push(`Đã bỏ lỡ nước chiếu hết: ${missed.line}.`);
  else if (missed?.kind === 'capture') out.push(`Đã bỏ lỡ cơ hội ăn ${missed.piece} bằng ${missed.san}.`);

  if (played && best && missed?.kind !== 'mate') {
    const gap = best.diff - played.diff;
    if (gap >= 2) {
      // Nước tốt nhất lời quân nhiều hơn hẳn
      if (played.diff >= 1)
        out.push(
          `Nước này vẫn giúp ${subject} lời ${played.diff} điểm quân (${within(played)}), nhưng ${move.bestSan} lời được ${best.diff} (${within(best)}) — tức là bỏ lỡ ${gap} điểm quân.`,
        );
      else if (missed?.kind !== 'capture')
        out.push(
          `Nếu đi ${move.bestSan}, ${within(best)} ${subject} ${fmt(best.diff)} điểm quân (${short(best.startPly, best.sans.slice(0, best.keyPlies ?? 6))}); còn với ${move.san} thì ${fmt(played.diff)}.`,
        );
    } else if (out.length === 0) {
      // Quân số gần như nhau → lợi thế của nước tốt nhất nằm ở thế cờ / đòn tấn công Vua
      const bestW = before?.lines[0] ? formatEval(toWhite(before.lines[0].score, move.color)) : '?';
      const evalText = `Engine đánh giá: nếu đi ${move.bestSan} là ${bestW}, còn sau ${move.san} chỉ ${formatEval(move.evalAfter)} (dương = Trắng hơn).`;
      const checks = before?.lines[0] ? explainLine(move.fenBefore, before.lines[0].pv, move.color).steps.filter((s) => s.isMe && s.check).length : 0;
      if (checks >= 2) {
        out.push(
          `${evalText} Lợi thế của ${move.bestSan} đến từ đòn tấn công thẳng vào Vua đối thủ (biến tốt nhất có ${checks} nước chiếu) — chưa kịp thành quân trong biến engine tính, nhưng rất khó đỡ.`,
        );
      } else {
        out.push(
          `${evalText} Về quân số hai lựa chọn tương đương (${fmt(played.diff)} so với ${fmt(best.diff)}), nên khác biệt nằm ở thế cờ: vị trí quân, an toàn của Vua, thế công — bấm "Nếu đi ${move.bestSan}" để xem engine định làm gì.`,
        );
      }
    }
  }

  if (out.length === 0 && move.classification !== 'inaccuracy')
    out.push('Thế cờ xấu đi (vị trí quân, an toàn của Vua…) — bấm "Diễn biến" bên dưới để xem engine thấy gì.');
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
