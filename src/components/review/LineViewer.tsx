import { useEffect, useRef, useState } from 'react';
import { stepNumber, type LineExplanation } from '../../analysis/lineExplain';

export interface ActiveLine {
  kind: 'played' | 'best';
  title: string;
  exp: LineExplanation;
  /** Đánh giá của engine ở đầu biến (góc nhìn Trắng, đã định dạng) */
  engineEval?: string;
  step: number;
}

const fmtBalance = (b: number) => (b > 0 ? `+${b}` : b < 0 ? `−${-b}` : '0');

/** Diễn lại một biến của engine từng nước, kèm chú thích và tổng kết */
export default function LineViewer({
  line,
  onStep,
  onClose,
}: {
  line: ActiveLine;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const { exp, step } = line;
  const total = exp.steps.length;
  const [auto, setAuto] = useState(false);

  // Tự chạy: mỗi 1,2 giây sang nước tiếp, dừng ở cuối biến
  useEffect(() => {
    if (!auto) return;
    if (step >= total) {
      setAuto(false);
      return;
    }
    const t = setTimeout(() => onStep(step + 1), step === 0 ? 400 : 1200);
    return () => clearTimeout(t);
  }, [auto, step, total, onStep]);

  const current = exp.steps[step - 1];
  const keyStep = exp.keyIndex != null ? exp.keyIndex + 1 : null;

  // Biến có thể dài → cuộn danh sách theo nước đang xem
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('.lv-step.active');
    if (!box || !el) return;
    if (el.offsetTop < box.scrollTop || el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = el.offsetTop - box.clientHeight / 2;
    }
  }, [step]);

  return (
    <div className="card line-viewer" aria-live="polite">
      <div className="lv-head">
        <strong>{line.title}</strong>
        <button className="btn ghost small" onClick={onClose}>
          Quay lại ván
        </button>
      </div>

      <p className="lv-now">
        {step === 0 ? (
          <span className="muted">Bấm ▶ hoặc phím → để xem từng nước.</span>
        ) : (
          <>
            <b>
              {stepNumber(current.ply)} {current.san}
            </b>{' '}
            — {current.isMe ? 'bạn' : 'đối thủ'} đi
            {current.notes.length > 0 && <>, {current.notes.join(', ')}</>}. Điểm quân: <b>{fmtBalance(current.balance)}</b>
          </>
        )}
      </p>

      <ol className="lv-steps" ref={listRef}>
        {exp.steps.map((s, i) => (
          <li key={i}>
            <button
              className={`lv-step ${i + 1 === step ? 'active' : ''} ${i + 1 > step ? 'future' : ''} ${i === exp.keyIndex ? 'key' : ''}`}
              onClick={() => onStep(i + 1)}
            >
              <span className="lv-num">{stepNumber(s.ply)}</span>
              <span className="lv-san">{s.san}</span>
              <span className={`lv-who ${s.isMe ? 'me' : 'opp'}`}>{s.isMe ? 'Bạn' : 'Đối thủ'}</span>
              <span className="lv-notes">
                {s.notes.join(', ')}
                {i === exp.keyIndex && <span className="lv-key">⚑ rõ kết quả</span>}
              </span>
              <span className={`lv-bal ${s.balance > 0 ? 'pos' : s.balance < 0 ? 'neg' : ''}`}>{fmtBalance(s.balance)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="lv-summary">
        <p>{exp.summary}</p>
        {line.engineEval && (
          <p className="muted small">
            Engine đánh giá thế cờ này là <b>{line.engineEval}</b> (dương = Trắng hơn, âm = Đen hơn). Biến trên là cách hai bên đi
            chuẩn nhất theo engine; điểm quân chỉ là một phần, engine còn tính vị trí quân và an toàn của Vua.
          </p>
        )}
      </div>

      <div className="lv-controls">
        <button className="btn icon" onClick={() => onStep(0)} disabled={step === 0} aria-label="Về đầu biến">
          ⏮
        </button>
        <button className="btn icon" onClick={() => onStep(step - 1)} disabled={step === 0} aria-label="Nước trước trong biến">
          ◀
        </button>
        <button className="btn icon" onClick={() => onStep(step + 1)} disabled={step >= total} aria-label="Nước sau trong biến">
          ▶
        </button>
        <button className="btn icon" onClick={() => onStep(total)} disabled={step >= total} aria-label="Tới cuối biến">
          ⏭
        </button>
        {keyStep != null && (
          <button className="btn key-btn" onClick={() => onStep(keyStep)} disabled={step === keyStep} title="Nhảy tới nước mà kết quả lộ rõ">
            ⚑ Tới lúc rõ kết quả
          </button>
        )}
        <button
          className={`btn ${auto ? 'ghost on' : 'primary'}`}
          onClick={() => {
            if (!auto && step >= total) onStep(0);
            setAuto((a) => !a);
          }}
        >
          {auto ? 'Dừng' : 'Tự chạy'}
        </button>
      </div>
    </div>
  );
}
