import { useCallback, useEffect, useRef, useState } from 'react';
import { buildReview, type GameReview } from '../analysis/review';
import { loadEco } from '../analysis/openings';
import { evaluatePositions } from '../engine/analyzeGame';
import { getEngine } from '../engine/stockfishClient';
import { positionsOf, type ParsedGame } from '../game/parseGame';
import { getCachedAnalysis, putCachedAnalysis } from '../storage/cache';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'analyzing'; done: number; total: number }
  | { status: 'done'; review: GameReview; depth: number; fromCache: boolean }
  | { status: 'error'; message: string };

/** Phân tích 1 ván: dùng cache nếu có, nếu không thì chạy Stockfish + lưu cache */
export function useGameAnalysis(game: ParsedGame | null, depth: number) {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (force = false) => {
      if (!game) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const fens = positionsOf(game);
      try {
        const ecoP = loadEco();
        const cached = force ? null : await getCachedAnalysis(game.id, depth, fens.length);
        if (cached) {
          const review = buildReview(game, cached.positions, await ecoP);
          if (!ac.signal.aborted) setState({ status: 'done', review, depth: cached.depth, fromCache: true });
          return;
        }
        setState({ status: 'analyzing', done: 0, total: fens.length });
        const positions = await evaluatePositions(fens, {
          depth,
          signal: ac.signal,
          onProgress: (done, total) => !ac.signal.aborted && setState({ status: 'analyzing', done, total }),
        });
        const engine = await getEngine();
        await putCachedAnalysis(game.id, depth, positions, `${engine.info.name} (${engine.info.flavor})`);
        const review = buildReview(game, positions, await ecoP);
        if (!ac.signal.aborted) setState({ status: 'done', review, depth, fromCache: false });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setState({ status: 'error', message: (e as Error).message });
      }
    },
    [game, depth],
  );

  useEffect(() => {
    run();
    return () => abortRef.current?.abort();
  }, [run]);

  return { state, reanalyze: () => run(true) };
}
