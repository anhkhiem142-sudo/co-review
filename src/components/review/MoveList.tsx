import { useEffect, useRef } from 'react';
import type { MoveReview } from '../../analysis/review';
import type { ParsedMove } from '../../game/parseGame';
import { CLASS_META, ClassIcon } from '../classMeta';

/** Bảng nước đi: số thứ tự | Trắng | Đen. Mỗi nước có icon + màu theo loại. */
export default function MoveList({
  moves,
  reviews,
  pos,
  onSelect,
}: {
  moves: ParsedMove[];
  reviews?: MoveReview[];
  pos: number;
  onSelect: (pos: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Cuộn nước đang xem vào giữa khung (chỉ cuộn khung, không cuộn cả trang)
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>('[data-active="true"]');
    if (!box || !el) {
      if (box && pos === 0) box.scrollTop = 0;
      return;
    }
    const top = el.offsetTop;
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = top - box.clientHeight / 2 + el.offsetHeight / 2;
    }
  }, [pos]);

  const rows = Math.ceil(moves.length / 2);
  const cell = (ply: number) => {
    const m = moves[ply];
    if (!m) return <td />;
    const r = reviews?.[ply];
    const active = pos === ply + 1;
    return (
      <td>
        <button
          className={`mv ${active ? 'active' : ''}`}
          data-active={active}
          onClick={() => onSelect(ply + 1)}
          style={r ? { color: textColor(r.classification) } : undefined}
        >
          {r && <ClassIcon c={r.classification} size={16} />}
          <span>{m.san}</span>
        </button>
      </td>
    );
  };

  return (
    <div className="card move-list" ref={ref}>
      <table>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              <td className="num">{r + 1}.</td>
              {cell(r * 2)}
              {cell(r * 2 + 1)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Chỉ tô màu chữ cho các loại nổi bật; nước bình thường giữ màu chữ mặc định cho dễ đọc */
function textColor(c: MoveReview['classification']) {
  return ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'].includes(c) ? CLASS_META[c].color : undefined;
}
