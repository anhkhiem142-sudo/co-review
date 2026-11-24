import { useEffect, useMemo, useState } from 'react';
import { harmonicMean } from '../../analysis/accuracy';
import { negateScore, scoreToCp, winPercent } from '../../analysis/winProb';
import type { EngineScore } from '../../engine/stockfishClient';
import { parsePgn, type ParsedGame } from '../../game/parseGame';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';
import { getLevel } from '../../play/levels';
import { usePlayGame } from '../../play/usePlayGame';
import { getUsername } from '../../storage/prefs';
import EvalBar from '../review/EvalBar';
import MoveList from '../review/MoveList';
import CoachPanel from './CoachPanel';
import PlayBoard from './PlayBoard';
import PlaySetup from './PlaySetup';

export default function PlayPage({ onReview }: { onReview: (game: ParsedGame, myColor: 'w' | 'b') => void }) {
  const game = usePlayGame();
  const { state } = game;
  /** null = đang xem thế cờ hiện tại; số = đang xem lại thế cờ cũ */
  const [view, setView] = useState<number | null>(null);
  const [showEval, setShowEval] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [liveEval, setLiveEval] = useState<{ fen: string; score: EngineScore } | null>(null);
  const [opening, setOpening] = useState(false);

  const n = state.moves.length;
  const pos = view ?? n;
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const fen = pos === 0 ? startFen : state.moves[pos - 1].fenAfter;
  const settings = state.settings;

  // Thanh lợi thế: lấy điểm của engine huấn luyện viên cho thế đang xem
  useEffect(() => {
    if (!settings) return;
    let alive = true;
    game
      .analysisFor(fen)
      .then((a) => {
        const s = a.lines[0]?.score;
        if (alive && s) setLiveEval({ fen, score: fen.split(' ')[1] === 'w' ? s : negateScore(s) });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, settings]);

  // Có nước mới → quay về thế hiện tại
  useEffect(() => setView(null), [n]);

  const nav = useMemo(
    () => ({
      prev: () => setView((v) => Math.max(0, (v ?? n) - 1)),
      next: () => setView((v) => (v == null || v + 1 >= n ? null : v + 1)),
      first: () => setView(0),
      last: () => setView(null),
    }),
    [n],
  );
  useKeyboardNav(nav);

  // Độ chính xác của bạn: chỉ tính các nước đã được chấm điểm
  const accuracy = useMemo(() => {
    if (!settings) return null;
    const accs = state.moves.flatMap((m, i) => (m.color === settings.userColor && state.evals[i] ? [state.evals[i]!.accuracy] : []));
    if (accs.length === 0) return null;
    const mean = accs.reduce((a, b) => a + b, 0) / accs.length;
    return (mean + harmonicMean(accs)) / 2;
  }, [state.evals, state.moves, settings]);

  if (!settings || state.status === 'setup') {
    return <PlaySetup onStart={game.start} onResume={game.resume} />;
  }

  const level = getLevel(settings.levelId);
  const live = view == null;
  const orientation: 'white' | 'black' = (settings.userColor === 'w') !== flipped ? 'white' : 'black';
  const last = state.moves[pos - 1];
  const whiteWin = liveEval && liveEval.fen === fen ? winPercent(scoreToCp(liveEval.score)) : 50;
  const me = getUsername() || 'Bạn';
  const thinking = state.status === 'thinking';
  const canUndo = state.moves.some((m) => m.color === settings.userColor) && state.status !== 'thinking';

  const openReview = async () => {
    setOpening(true);
    try {
      const { pgn, id, userColor } = await game.exportForReview();
      onReview(parsePgn(pgn, id), userColor);
    } finally {
      setOpening(false);
    }
  };

  const topName = orientation === 'white' ? 'b' : 'w';
  const nameOf = (c: 'w' | 'b') => (c === settings.userColor ? me : `Stockfish · ${level.label} (~${level.elo})`);

  return (
    <div className="review play">
      <div className="review-main">
        <div className="board-panel">
          <div className="player-bar">
            <span className={`avatar ${topName === 'w' ? 'white' : 'black'}`} aria-hidden>
              {nameOf(topName).slice(0, 1).toUpperCase()}
            </span>
            <span className="pb-name">{nameOf(topName)}</span>
            {topName !== settings.userColor && thinking && <span className="muted small">đang nghĩ…</span>}
          </div>
          <div className="board-row" style={showEval ? undefined : { gridTemplateColumns: '0 minmax(0,1fr)' }}>
            {showEval ? <EvalBar winPct={whiteWin} score={liveEval?.fen === fen ? liveEval.score : undefined} flipped={orientation === 'black'} /> : <span />}
            <PlayBoard
              fen={fen}
              orientation={orientation}
              canMove={live && state.status === 'user'}
              userColor={settings.userColor}
              lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4), classification: state.evals[pos - 1]?.classification } : undefined}
              hint={live ? state.hint : undefined}
              onMove={game.userMove}
            />
          </div>
          <div className="player-bar">
            <span className={`avatar ${topName === 'w' ? 'black' : 'white'}`} aria-hidden>
              {me.slice(0, 1).toUpperCase()}
            </span>
            <span className="pb-name">{me}</span>
            <span className="you">Bạn</span>
            {accuracy != null && <span className="pb-acc" title="Độ chính xác của bạn">{accuracy.toFixed(1)}</span>}
          </div>
        </div>

        {!live && (
          <div className="viewing-banner">
            Đang xem lại nước {pos}/{n}.{' '}
            <button className="link-btn" onClick={() => setView(null)}>
              Về thế cờ hiện tại
            </button>
          </div>
        )}

        <div className="nav play-actions">
          <button className="btn" onClick={game.hint} disabled={!live || state.status !== 'user'} title="Lần 1: chỉ quân cần đi · Lần 2: hiện nước cụ thể">
            Gợi ý
          </button>
          <button className="btn" onClick={game.undo} disabled={!canUndo} title="Quay lại trước nước gần nhất của bạn">
            Đi lại
          </button>
          {state.status === 'over' ? (
            <>
              <button className="btn primary" onClick={openReview} disabled={opening}>
                {opening ? 'Đang chuẩn bị…' : 'Xem lại cả ván'}
              </button>
              <button className="btn ghost" onClick={game.newGame}>
                Ván mới
              </button>
            </>
          ) : (
            <button
              className="btn ghost"
              onClick={() => window.confirm('Bạn chắc chắn muốn đầu hàng?') && game.resign()}
              disabled={state.moves.length === 0}
            >
              Đầu hàng
            </button>
          )}
          <button className={`btn ghost ${showEval ? 'on' : ''}`} onClick={() => setShowEval((v) => !v)} aria-pressed={showEval} title="Hiện/ẩn thanh lợi thế">
            ±
          </button>
          <button className="btn ghost" onClick={() => setFlipped((f) => !f)} aria-label="Xoay bàn cờ" title="Xoay bàn cờ">
            ⇅
          </button>
        </div>
      </div>

      <aside className="review-side">
        <div className="card side-head">
          <div className="side-title">
            <strong>
              {level.label} (~{level.elo})
            </strong>
            <span className="muted small">
              Bạn cầm {settings.userColor === 'w' ? 'Trắng' : 'Đen'}
              {state.undos > 0 && ` · đi lại ${state.undos} lần`}
              {state.hints > 0 && ` · ${state.hints} gợi ý`}
            </span>
          </div>
          {state.result && <p className="result-line">{state.result.text}</p>}
          {state.error && <p className="error">{state.error}</p>}
          {state.status !== 'over' && (
            <button className="btn ghost small" onClick={() => window.confirm('Bỏ ván này và chọn mức khác?') && game.newGame()}>
              Ván mới / đổi mức
            </button>
          )}
        </div>

        <CoachPanel messages={state.messages} thinking={thinking} onSelectPly={(p) => setView(p >= n ? null : p)} />
        <MoveList moves={state.moves} reviews={state.evals} pos={pos} onSelect={(p) => setView(p >= n ? null : p)} />
      </aside>
    </div>
  );
}
