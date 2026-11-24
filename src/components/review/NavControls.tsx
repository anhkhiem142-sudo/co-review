export default function NavControls({
  pos,
  max,
  onSelect,
  nextMistake,
  hint,
  onToggleHint,
  onFlip,
}: {
  pos: number;
  max: number;
  onSelect: (pos: number) => void;
  nextMistake: number | null;
  hint: boolean;
  onToggleHint: () => void;
  onFlip: () => void;
}) {
  return (
    <div className="nav">
      <div className="nav-main">
        <button className="btn icon" onClick={() => onSelect(0)} disabled={pos === 0} aria-label="Về đầu ván (Home)">
          ⏮
        </button>
        <button className="btn icon" onClick={() => onSelect(pos - 1)} disabled={pos === 0} aria-label="Nước trước (←)">
          ◀
        </button>
        <button className="btn icon" onClick={() => onSelect(pos + 1)} disabled={pos >= max} aria-label="Nước sau (→)">
          ▶
        </button>
        <button className="btn icon" onClick={() => onSelect(max)} disabled={pos >= max} aria-label="Tới cuối ván (End)">
          ⏭
        </button>
      </div>
      <div className="nav-extra">
        <button
          className="btn mistake-btn"
          onClick={() => nextMistake != null && onSelect(nextMistake)}
          disabled={nextMistake == null}
          title="Nhảy tới nước sai tiếp theo của bạn"
        >
          Nước sai tiếp theo
        </button>
        <button className={`btn ghost ${hint ? 'on' : ''}`} onClick={onToggleHint} aria-pressed={hint} title="Hiện nước tốt nhất ở thế cờ hiện tại">
          Gợi ý
        </button>
        <button className="btn ghost" onClick={onFlip} aria-label="Xoay bàn cờ" title="Xoay bàn cờ">
          ⇅
        </button>
      </div>
    </div>
  );
}
