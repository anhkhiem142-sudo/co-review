import { useCallback, useEffect, useState } from 'react';
import HomePage from './components/home/HomePage';
import PlayPage from './components/play/PlayPage';
import ReviewPage from './components/review/ReviewPage';
import { getEngine, type EngineInfo } from './engine/stockfishClient';
import type { ParsedGame } from './game/parseGame';
import { getDepth, setDepth as saveDepth, type DepthPreset } from './storage/prefs';

type Tab = 'home' | 'play';
type Route =
  | { name: 'home' }
  | { name: 'play' }
  /** depth: mở Review ở độ sâu cho trước (vd. ván vừa chơi đã có sẵn kết quả ở độ sâu 12) */
  | { name: 'review'; game: ParsedGame; myColor: 'w' | 'b'; depth?: DepthPreset };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [depth, setDepthState] = useState<DepthPreset>(getDepth);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  // Khởi động engine sớm để lúc chọn ván là phân tích được ngay
  useEffect(() => {
    getEngine()
      .then((e) => setEngine(e.info))
      .catch((e: Error) => setEngineError(e.message));
  }, []);

  // Nút Back của trình duyệt / điện thoại → quay lại tab đã mở màn hình Review
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setRoute(e.state?.tab === 'play' ? { name: 'play' } : { name: 'home' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openGame = useCallback((game: ParsedGame, myColor: 'w' | 'b', depthOverride?: DepthPreset) => {
    window.history.pushState({ review: game.id }, '');
    setRoute({ name: 'review', game, myColor, depth: depthOverride });
    window.scrollTo(0, 0);
  }, []);

  const goTab = useCallback((tab: Tab) => {
    window.history.replaceState({ tab }, '');
    setRoute(tab === 'play' ? { name: 'play' } : { name: 'home' });
    window.scrollTo(0, 0);
  }, []);

  const goHome = useCallback(() => {
    if (window.history.state?.review) window.history.back();
    else setRoute({ name: 'home' });
  }, []);

  const changeDepth = useCallback((d: DepthPreset) => {
    saveDepth(d);
    setDepthState(d);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand-btn" onClick={() => goTab('home')} aria-label="Cờ Review — trang chủ">
          <img src="/logo.svg" alt="" width={30} height={30} />
          <span className="brand">Cờ Review</span>
        </button>
        <nav className="tabs" aria-label="Chế độ">
          <button className={route.name !== 'play' ? 'active' : ''} onClick={() => goTab('home')}>
            Xem lại ván
          </button>
          <button className={route.name === 'play' ? 'active' : ''} onClick={() => goTab('play')}>
            Đấu với máy
          </button>
        </nav>
        <span className="engine-status muted small" title={engine ? `${engine.name}` : undefined}>
          {engineError
            ? 'Engine lỗi'
            : engine
              ? `Stockfish 19 · ${engine.threads > 1 ? `${engine.threads} luồng` : '1 luồng'}`
              : 'Đang tải engine…'}
        </span>
      </header>

      <main className="page">
        {engineError && <p className="error card">Không khởi động được Stockfish: {engineError}</p>}
        {route.name === 'home' ? (
          <HomePage depth={depth} onDepthChange={changeDepth} onOpenGame={openGame} />
        ) : route.name === 'play' ? (
          <PlayPage onReview={(game, color) => openGame(game, color, 12)} />
        ) : (
          <ReviewPage
            key={route.game.id}
            game={route.game}
            myColor={route.myColor}
            depth={route.depth ?? depth}
            onDepthChange={(d) => {
              changeDepth(d);
              setRoute((r) => (r.name === 'review' ? { ...r, depth: undefined } : r));
            }}
            onBack={goHome}
          />
        )}
      </main>

      <footer className="footer muted small">
        <span>
          Engine <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">Stockfish</a> (GPL-3.0) ·
          Dữ liệu ván từ{' '}
          <a href="https://www.chess.com/news/view/published-data-api" target="_blank" rel="noreferrer">
            chess.com Public API
          </a>{' '}
          · Khai cuộc từ <a href="https://github.com/lichess-org/chess-openings" target="_blank" rel="noreferrer">lichess chess-openings</a> (CC0)
        </span>
        <span>Cờ Review là dự án độc lập, không liên kết với Chess.com.</span>
      </footer>
    </div>
  );
}
