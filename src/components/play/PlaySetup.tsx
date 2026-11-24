import { useState } from 'react';
import { LEVELS, getLevel } from '../../play/levels';
import { loadSavedGame, type Color, type PlaySettings } from '../../play/usePlayGame';

const K_LEVEL = 'co-review:play-level';

function savedLevel(): string {
  try {
    return localStorage.getItem(K_LEVEL) ?? 'basic';
  } catch {
    return 'basic';
  }
}

export default function PlaySetup({
  onStart,
  onResume,
}: {
  onStart: (s: PlaySettings) => void;
  onResume: (saved: NonNullable<ReturnType<typeof loadSavedGame>>) => void;
}) {
  const [levelId, setLevelId] = useState(savedLevel);
  const [color, setColor] = useState<Color | 'random'>('w');
  const [saved] = useState(loadSavedGame);

  const start = () => {
    try {
      localStorage.setItem(K_LEVEL, levelId);
    } catch {
      /* bỏ qua */
    }
    const userColor: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    onStart({ levelId, userColor });
  };

  return (
    <div className="play-setup">
      <section className="hero">
        <h1>Đấu với máy, có thầy kèm</h1>
        <p className="muted">
          Chọn sức mạnh của Stockfish rồi chơi. Sau mỗi nước, huấn luyện viên sẽ nhận xét: nước tốt hay sai, vì sao, và nước
          nào tốt hơn. Đi sai thì có thể đi lại.
        </p>
      </section>

      {saved && (
        <div className="card resume-card">
          <div>
            <strong>Ván đang chơi dở</strong>
            <p className="muted small">
              {getLevel(saved.settings.levelId).label} · bạn cầm {saved.settings.userColor === 'w' ? 'Trắng' : 'Đen'} ·{' '}
              {Math.ceil(saved.ucis.length / 2)} nước
            </p>
          </div>
          <button className="btn primary" onClick={() => onResume(saved)}>
            Chơi tiếp
          </button>
        </div>
      )}

      <section className="card">
        <header className="section-head">
          <h2>Sức mạnh của máy</h2>
        </header>
        <div className="level-grid" role="radiogroup" aria-label="Sức mạnh của máy">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={levelId === l.id}
              className={`level-card ${levelId === l.id ? 'active' : ''}`}
              onClick={() => setLevelId(l.id)}
            >
              <span className="level-name">{l.label}</span>
              <span className="level-elo">~{l.elo}</span>
              <span className="muted small">{l.desc}</span>
            </button>
          ))}
        </div>
        <p className="muted small note">
          Elo chỉ là ước lượng. Từ mức Khá trở lên dùng chế độ giới hạn Elo có sẵn của Stockfish; các mức thấp hơn được làm yếu
          bằng cách cho máy thỉnh thoảng chọn nước kém hơn.
        </p>
      </section>

      <section className="card">
        <header className="section-head">
          <h2>Bạn cầm quân</h2>
        </header>
        <div className="segmented big" role="radiogroup" aria-label="Màu quân">
          {(
            [
              ['w', 'Trắng'],
              ['random', 'Ngẫu nhiên'],
              ['b', 'Đen'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} role="radio" aria-checked={color === v} className={color === v ? 'active' : ''} onClick={() => setColor(v)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <button className="btn primary start-btn" onClick={start}>
        Bắt đầu ván mới
      </button>
    </div>
  );
}
