import { useState } from 'react';
import GameList from './GameList';
import PgnPaste from './PgnPaste';
import DepthPicker from '../DepthPicker';
import { getUsername, setUsername as saveUsername, type DepthPreset } from '../../storage/prefs';
import type { ParsedGame } from '../../game/parseGame';

export default function HomePage({
  depth,
  onDepthChange,
  onOpenGame,
}: {
  depth: DepthPreset;
  onDepthChange: (d: DepthPreset) => void;
  onOpenGame: (game: ParsedGame, myColor: 'w' | 'b') => void;
}) {
  const [input, setInput] = useState(getUsername);
  const [active, setActive] = useState(getUsername);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = input.trim();
    if (!u) return;
    saveUsername(u);
    setActive(u);
  };

  return (
    <div className="home">
      <section className="hero">
        <h1>Xem lại ván cờ của bạn</h1>
        <p className="muted">
          Nhập tên tài khoản chess.com, chọn một ván, Stockfish sẽ phân tích từng nước ngay trên trình duyệt — không cần
          đăng nhập, không gửi dữ liệu đi đâu.
        </p>
        <form className="user-form" onSubmit={submit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tên tài khoản chess.com"
            aria-label="Tên tài khoản chess.com"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn primary" type="submit">
            Xem ván
          </button>
        </form>
        <div className="depth-row">
          <span className="muted">Độ sâu phân tích</span>
          <DepthPicker value={depth} onChange={onDepthChange} />
        </div>
      </section>

      {active && <GameList key={active.toLowerCase()} username={active} onOpenGame={onOpenGame} />}

      <PgnPaste username={active} onOpenGame={onOpenGame} />
    </div>
  );
}
