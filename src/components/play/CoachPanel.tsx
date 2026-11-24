import { useEffect, useRef } from 'react';
import type { CoachMessage } from '../../play/coach';
import { CLASS_META, ClassIcon } from '../classMeta';

/** Khung trò chuyện của huấn luyện viên — tin mới nhất ở dưới cùng */
export default function CoachPanel({
  messages,
  thinking,
  onSelectPly,
}: {
  messages: CoachMessage[];
  thinking: boolean;
  onSelectPly: (ply: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    // Đợi trình duyệt vẽ xong tin mới rồi mới cuộn xuống cuối
    const id = requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
    return () => cancelAnimationFrame(id);
  }, [messages.length, thinking]);

  return (
    <div className="card coach">
      <div className="coach-head">
        <img src="/logo.svg" alt="" width={34} height={34} className="coach-avatar" />
        <div>
          <strong>Huấn luyện viên</strong>
          <div className="muted small">{thinking ? 'Máy đang suy nghĩ…' : 'Đang theo dõi ván của bạn'}</div>
        </div>
      </div>
      <div className="coach-feed" ref={ref} aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`coach-msg tone-${m.tone}`} style={m.classification ? { borderColor: CLASS_META[m.classification].color } : undefined}>
            <div className="coach-msg-title">
              {m.classification && <ClassIcon c={m.classification} size={18} />}
              <span>{m.title}</span>
              {m.ply != null && (
                <button className="link-btn" onClick={() => onSelectPly(m.ply! + 1)} title="Xem thế cờ này">
                  Xem
                </button>
              )}
            </div>
            <p>{m.body}</p>
          </div>
        ))}
        {thinking && (
          <div className="coach-typing" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </div>
  );
}
