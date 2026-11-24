import { useState } from 'react';
import { parsePgn, type ParsedGame } from '../../game/parseGame';

export default function PgnPaste({
  username,
  onOpenGame,
}: {
  username: string;
  onOpenGame: (game: ParsedGame, myColor: 'w' | 'b') => void;
}) {
  const [pgn, setPgn] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const game = parsePgn(pgn);
      // Nếu tên trong PGN trùng username đã lưu thì xoay bàn theo màu đó
      const me = username.trim().toLowerCase();
      const myColor = me && game.black.name.toLowerCase() === me ? 'b' : 'w';
      setError(null);
      onOpenGame(game, myColor);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="card pgn-paste">
      <header className="section-head">
        <h2>Hoặc dán PGN</h2>
      </header>
      <form onSubmit={submit}>
        <textarea
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          placeholder={'[Event "..."]\n1. e4 e5 2. Nf3 Nc6 …'}
          rows={5}
          spellCheck={false}
          aria-label="PGN ván cờ"
        />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit" disabled={!pgn.trim()}>
          Phân tích PGN
        </button>
      </form>
    </section>
  );
}
