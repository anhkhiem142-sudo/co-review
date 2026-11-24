import { useCallback, useEffect, useRef, useState } from 'react';
import {
  archiveLabel,
  fetchArchives,
  fetchMonthGames,
  formatTimeControl,
  TIME_CLASS_LABEL,
  type GameSummary,
} from '../../api/chesscom';
import { parsePgn, type ParsedGame } from '../../game/parseGame';
import { analyzedGameIds } from '../../storage/cache';

const MIN_INITIAL = 10;
const OUTCOME_LABEL = { win: 'Thắng', loss: 'Thua', draw: 'Hòa' } as const;

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function GameList({
  username,
  onOpenGame,
}: {
  username: string;
  onOpenGame: (game: ParsedGame, myColor: 'w' | 'b') => void;
}) {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [archives, setArchives] = useState<string[] | null>(null);
  /** Số tháng (tính từ tháng mới nhất) đã tải */
  const [loadedMonths, setLoadedMonths] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState<Set<string>>(new Set());
  const started = useRef(false);

  const loadMonths = useCallback(
    async (all: string[], from: number, minGames: number) => {
      setLoading(true);
      setError(null);
      let idx = from;
      let added: GameSummary[] = [];
      try {
        // Tải lần lượt các tháng cũ hơn cho tới khi đủ số ván tối thiểu
        do {
          const url = all[all.length - 1 - idx];
          if (!url) break;
          added = added.concat(await fetchMonthGames(url, username));
          idx++;
        } while (added.length < minGames && idx < all.length);
        setGames((g) => [...g, ...added]);
        setLoadedMonths(idx);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [username],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      setLoading(true);
      try {
        const all = await fetchArchives(username);
        setArchives(all);
        if (all.length === 0) {
          setLoading(false);
          return;
        }
        await loadMonths(all, 0, MIN_INITIAL);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    analyzedGameIds().then(setAnalyzed);
  }, [username, loadMonths]);

  const open = (g: GameSummary) => {
    try {
      onOpenGame(parsePgn(g.pgn, g.id), g.myColor);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const hasMore = archives != null && loadedMonths < archives.length;
  const nextLabel = archives && hasMore ? archiveLabel(archives[archives.length - 1 - loadedMonths]) : '';

  return (
    <section className="card game-list">
      <header className="section-head">
        <h2>Ván gần đây của {username}</h2>
        {archives && <span className="muted small">{games.length} ván</span>}
      </header>

      {error && <p className="error">{error}</p>}
      {archives && archives.length === 0 && <p className="muted">Tài khoản này chưa có ván nào.</p>}

      <ul className="games">
        {games.map((g) => (
          <li key={g.id}>
            <button className="game-row" onClick={() => open(g)}>
              <span className={`outcome ${g.outcome}`}>{OUTCOME_LABEL[g.outcome]}</span>
              <span className="game-main">
                <span className="game-opp">
                  <span className={`color-dot ${g.myColor === 'w' ? 'black' : 'white'}`} aria-hidden />
                  <strong>{g.opponent.username}</strong>
                  <span className="muted">({g.opponent.rating})</span>
                </span>
                <span className="game-meta muted small">
                  Bạn cầm {g.myColor === 'w' ? 'Trắng' : 'Đen'} · {g.me.rating} · {dateFmt.format(g.endTime)}
                </span>
              </span>
              <span className="game-side">
                <span className={`tc tc-${g.timeClass}`}>{TIME_CLASS_LABEL[g.timeClass]}</span>
                <span className="muted small">{formatTimeControl(g.timeControl)}</span>
                {analyzed.has(g.id) && <span className="badge-done">Đã phân tích</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {loading && <div className="loading-line">Đang tải ván từ chess.com…</div>}

      {hasMore && !loading && archives && (
        <button className="btn ghost wide" onClick={() => loadMonths(archives, loadedMonths, 1)}>
          Tải thêm tháng trước ({nextLabel})
        </button>
      )}
    </section>
  );
}
