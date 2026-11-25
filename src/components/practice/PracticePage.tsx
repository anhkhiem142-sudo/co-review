import { useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { negateScore, scoreToCp, winPercent } from '../../analysis/winProb';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';
import { pieceName } from '../../play/coach';
import { parsePosition, START_FEN, usePractice } from '../../practice/usePractice';
import { CLASS_META, ClassIcon, formatEval, moveNumber } from '../classMeta';
import PlayBoard from '../play/PlayBoard';
import EvalBar from '../review/EvalBar';
import MoveList from '../review/MoveList';

/** "Mã g1 → f3" */
function describeMove(fen: string, uci: string): { text: string; san?: string } {
  const chess = new Chess(fen);
  const p = chess.get(uci.slice(0, 2) as Square);
  let san: string | undefined;
  try {
    san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    /* bỏ qua */
  }
  return { text: `${p ? pieceName(p.type) : 'Quân'} ${uci.slice(0, 2)} → ${uci.slice(2, 4)}`, san };
}

function statusText(fen: string): string | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return `Chiếu hết — ${c.turn() === 'w' ? 'Đen' : 'Trắng'} thắng.`;
  if (c.isStalemate()) return 'Hòa do hết nước đi (stalemate).';
  if (c.isInsufficientMaterial()) return 'Hòa do không đủ quân để chiếu hết.';
  if (c.isDraw()) return 'Hòa.';
  if (c.inCheck()) return `${c.turn() === 'w' ? 'Trắng' : 'Đen'} đang bị chiếu.`;
  return null;
}

export default function PracticePage() {
  const p = usePractice();
  const [flipped, setFlipped] = useState(false);
  const [loader, setLoader] = useState(false);
  const [loadText, setLoadText] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const nav = useMemo(
    () => ({
      prev: () => p.goTo(p.cursor - 1),
      next: () => p.goTo(p.cursor + 1),
      first: () => p.goTo(0),
      last: () => p.goTo(p.moves.length),
    }),
    [p],
  );
  useKeyboardNav(nav);

  const turn = p.fen.split(' ')[1] as 'w' | 'b';
  const orientation: 'white' | 'black' = flipped ? 'black' : 'white';
  const last = p.moves[p.cursor - 1];
  const lastEval = last ? p.evalOf(last) : undefined;
  const status = statusText(p.fen);
  const gameOver = new Chess(p.fen).isGameOver();

  // Thanh lợi thế (góc nhìn Trắng)
  const top = p.analysis?.lines[0];
  const whiteScore = top ? (turn === 'w' ? top.score : negateScore(top.score)) : undefined;
  const whiteWin = whiteScore ? winPercent(scoreToCp(whiteScore)) : 50;

  const hint = p.showHints && p.bestUci ? describeMove(p.fen, p.bestUci) : null;
  const arrows = useMemo(
    () => (p.showHints && p.bestUci ? [{ startSquare: p.bestUci.slice(0, 2), endSquare: p.bestUci.slice(2, 4), color: '#80b64b' }] : []),
    [p.showHints, p.bestUci],
  );

  // Nước tốt nhất ở thế trước nước vừa đi (để nói "lẽ ra nên đi…")
  const lastBest = last && lastEval && !['best', 'book', 'brilliant', 'great'].includes(lastEval.classification);

  const doLoad = () => {
    try {
      const { startFen, ucis } = parsePosition(loadText);
      p.reset(startFen, ucis);
      setLoader(false);
      setLoadText('');
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };

  return (
    <div className="review play practice">
      <div className="review-main">
        <div className="board-panel">
          <div className="player-bar">
            <span className="muted small">
              Lượt đi: <b>{turn === 'w' ? 'Trắng' : 'Đen'}</b> — bạn điều khiển cả hai màu
            </span>
          </div>
          <div className="board-row" style={p.showHints ? undefined : { gridTemplateColumns: '0 minmax(0,1fr)' }}>
            {p.showHints ? <EvalBar winPct={whiteWin} score={whiteScore} flipped={orientation === 'black'} /> : <span />}
            <PlayBoard
              fen={p.fen}
              orientation={orientation}
              canMove={!gameOver}
              userColor={turn}
              lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4), classification: lastEval?.classification } : undefined}
              extraArrows={arrows}
              onMove={p.move}
            />
          </div>
        </div>

        <div className="nav">
          <div className="nav-main">
            <button className="btn icon" onClick={nav.first} disabled={p.cursor === 0} aria-label="Về đầu (Home)">
              ⏮
            </button>
            <button className="btn icon" onClick={nav.prev} disabled={p.cursor === 0} aria-label="Lùi 1 nước (←)">
              ◀
            </button>
            <button className="btn icon" onClick={nav.next} disabled={p.cursor >= p.moves.length} aria-label="Tiến 1 nước (→)">
              ▶
            </button>
            <button className="btn icon" onClick={nav.last} disabled={p.cursor >= p.moves.length} aria-label="Tới nước cuối (End)">
              ⏭
            </button>
          </div>
          <div className="nav-extra">
            <button
              className={`btn ghost ${p.showHints ? 'on' : ''}`}
              onClick={() => p.setShowHints(!p.showHints)}
              aria-pressed={p.showHints}
              title="Bật/tắt gợi ý và thanh lợi thế"
            >
              Gợi ý: {p.showHints ? 'Bật' : 'Tắt'}
            </button>
            <button className="btn ghost" onClick={() => setFlipped((f) => !f)} aria-label="Xoay bàn cờ" title="Xoay bàn cờ">
              ⇅
            </button>
          </div>
        </div>
      </div>

      <aside className="review-side">
        <div className="card side-head">
          <div className="side-title">
            <strong>Tự luyện tập</strong>
            <span className="muted small">Stockfish 19 · sức mạnh tối đa</span>
          </div>
          {status && <p className="result-line">{status}</p>}
          <div className="side-controls">
            <button className="btn ghost small" onClick={() => p.reset(START_FEN)}>
              Ván mới
            </button>
            <button className={`btn ghost small ${loader ? 'on' : ''}`} onClick={() => setLoader((v) => !v)}>
              Nhập FEN / PGN
            </button>
          </div>
          {loader && (
            <div className="loader">
              <textarea
                value={loadText}
                onChange={(e) => setLoadText(e.target.value)}
                rows={3}
                spellCheck={false}
                placeholder="Dán FEN (vd. rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1) hoặc PGN"
                aria-label="FEN hoặc PGN"
              />
              {loadError && <p className="error">{loadError}</p>}
              <button className="btn primary small" onClick={doLoad} disabled={!loadText.trim()}>
                Bắt đầu từ thế này
              </button>
            </div>
          )}
        </div>

        <div className="card hint-card">
          <div className="hint-head">
            <span className="hint-label">Gợi ý cho {turn === 'w' ? 'Trắng' : 'Đen'}</span>
            {p.showHints && p.analysis && p.analysis.depth > 0 && (
              <span className="muted small">
                độ sâu {p.analysis.depth}
                {!p.analysis.final && ' · đang tính sâu hơn…'}
              </span>
            )}
          </div>
          {!p.showHints ? (
            <p className="muted">Gợi ý đang tắt — tự nghĩ nước đi nhé. Bấm "Gợi ý: Tắt" để bật lại.</p>
          ) : gameOver ? (
            <p className="muted">Ván đã kết thúc.</p>
          ) : hint ? (
            <p className="hint-move">
              <b>{hint.text}</b>
              {hint.san && <span className="muted"> ({hint.san})</span>}
              {whiteScore && <span className="eval-chip">{formatEval(whiteScore)}</span>}
            </p>
          ) : (
            <p className="muted">Stockfish đang suy nghĩ…</p>
          )}
          {p.showHints && <p className="muted small">Đây chỉ là gợi ý — bạn có thể đi bất kỳ nước nào khác.</p>}
        </div>

        {last && (
          <div className="card last-move" style={lastEval ? { borderColor: CLASS_META[lastEval.classification].color } : undefined}>
            {lastEval ? (
              <>
                <div className="explain-head">
                  <ClassIcon c={lastEval.classification} size={22} />
                  <span>
                    <b>
                      {moveNumber(last.ply)} {last.san}
                    </b>{' '}
                    là nước <b style={{ color: CLASS_META[lastEval.classification].color }}>{CLASS_META[lastEval.classification].label.toLowerCase()}</b>
                  </span>
                </div>
                {lastBest && <LastBest fenBefore={last.fenBefore} p={p} />}
              </>
            ) : (
              <span className="muted">Đang chấm nước {last.san}…</span>
            )}
          </div>
        )}

        <MoveList
          moves={p.moves}
          reviews={p.moves.map((m) => {
            const e = p.evalOf(m);
            return e ? { classification: e.classification } : undefined;
          })}
          pos={p.cursor}
          onSelect={p.goTo}
        />
      </aside>
    </div>
  );
}

/** "Lẽ ra nên đi: Mã g1 → f3" — lấy từ phân tích đã lưu của thế trước */
function LastBest({ fenBefore, p }: { fenBefore: string; p: ReturnType<typeof usePractice> }) {
  // Nước vừa đi đã được chấm ⇒ thế trước chắc chắn đã có trong cache phân tích
  const best = p.bestFor(fenBefore);
  if (!best) return null;
  const d = describeMove(fenBefore, best);
  return (
    <p className="explain-line">
      Lẽ ra nên đi: <b className="best-san">{d.text}</b>
      {d.san && <span className="muted"> ({d.san})</span>}
    </p>
  );
}
