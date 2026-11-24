// Bọc Stockfish WASM (chạy trong Web Worker) bằng giao thức UCI.
// - Nếu trang được cross-origin isolated (có SharedArrayBuffer) → dùng bản lite đa luồng.
// - Nếu không, hoặc bản đa luồng lỗi khi khởi động → tự chuyển sang bản lite 1 luồng.

export interface EngineScore {
  /** centipawn, theo góc nhìn bên đang tới lượt đi */
  cp?: number;
  /** số nước tới chiếu hết; dương = bên đang đi chiếu hết đối thủ, âm/0 = bị chiếu hết */
  mate?: number;
}

export interface EngineLine {
  multipv: number;
  depth: number;
  score: EngineScore;
  /** biến chính, dạng UCI (vd. "e2e4") */
  pv: string[];
}

export type EngineFlavor = 'lite' | 'lite-single';

export interface EngineInfo {
  flavor: EngineFlavor;
  threads: number;
  name: string;
}

const ENGINE_URL: Record<EngineFlavor, string> = {
  lite: '/engine/stockfish-19-lite.js',
  'lite-single': '/engine/stockfish-19-lite-single.js',
};

const INIT_TIMEOUT_MS = 20000;

export class StockfishClient {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  /** chuỗi Promise để các lệnh analyze chạy tuần tự */
  private queue: Promise<unknown> = Promise.resolve();
  info: EngineInfo;

  private constructor(worker: Worker, info: EngineInfo) {
    this.worker = worker;
    this.info = info;
    worker.onmessage = (e: MessageEvent) => {
      const text = typeof e.data === 'string' ? e.data : String(e.data);
      for (const line of text.split('\n')) {
        if (line) this.listeners.forEach((fn) => fn(line));
      }
    };
  }

  /** Tạo engine, tự chọn bản đa luồng nếu có thể. */
  static async create(): Promise<StockfishClient> {
    const canThread = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
    if (canThread) {
      const cores = navigator.hardwareConcurrency || 2;
      const threads = Math.max(1, Math.min(cores - 1, 8));
      try {
        return await StockfishClient.boot('lite', threads);
      } catch (err) {
        console.warn('[engine] Bản đa luồng lỗi, chuyển sang 1 luồng:', err);
      }
    }
    return StockfishClient.boot('lite-single', 1);
  }

  private static async boot(flavor: EngineFlavor, threads: number): Promise<StockfishClient> {
    const worker = new Worker(ENGINE_URL[flavor]);
    const client = new StockfishClient(worker, { flavor, threads, name: 'Stockfish' });
    try {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          worker.onerror = (e) => reject(new Error(e.message || 'Worker error'));
          client.waitFor((l) => l.startsWith('id name '), (l) => (client.info.name = l.slice(8)));
          client.waitFor((l) => l === 'uciok').then(() => resolve());
          client.send('uci');
        }),
        INIT_TIMEOUT_MS,
      );
      worker.onerror = null;
      if (flavor === 'lite') client.send(`setoption name Threads value ${threads}`);
      const hashMb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
      client.send(`setoption name Hash value ${hashMb >= 4 ? 64 : 16}`);
      await client.isReady();
      return client;
    } catch (err) {
      worker.terminate();
      throw err;
    }
  }

  send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(match: (line: string) => boolean, onMatch?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const fn = (line: string) => {
        if (match(line)) {
          this.listeners.delete(fn);
          onMatch?.(line);
          resolve(line);
        }
      };
      this.listeners.add(fn);
    });
  }

  isReady(): Promise<void> {
    const p = this.waitFor((l) => l === 'readyok').then(() => undefined);
    this.send('isready');
    return p;
  }

  /** Báo engine đây là ván mới (xóa hash) */
  newGame(): Promise<void> {
    return this.enqueue(async () => {
      this.send('ucinewgame');
      await this.isReady();
    });
  }

  /**
   * Phân tích 1 thế cờ tới độ sâu cho trước. Trả về các biến (MultiPV) ở độ sâu cuối cùng,
   * sắp theo thứ tự multipv (1 = tốt nhất).
   */
  analyze(fen: string, depth: number, multiPv = 2, maxMs?: number): Promise<EngineLine[]> {
    return this.enqueue(async () => {
      const lines = new Map<number, EngineLine>();
      const onLine = (line: string) => {
        const parsed = parseInfo(line);
        if (parsed) lines.set(parsed.multipv, parsed);
      };
      this.listeners.add(onLine);
      try {
        this.send(`setoption name MultiPV value ${multiPv}`);
        this.send(`position fen ${fen}`);
        const done = this.waitFor((l) => l.startsWith('bestmove'));
        // movetime: chặn trên thời gian — ở thế cờ chênh lệch lớn cây tìm kiếm phình rất to
        // trong khi Win% đã bão hòa, nên không cần tính hết độ sâu.
        this.send(maxMs ? `go depth ${depth} movetime ${maxMs}` : `go depth ${depth}`);
        await done;
      } finally {
        this.listeners.delete(onLine);
      }
      return [...lines.values()].sort((a, b) => a.multipv - b.multipv);
    });
  }

  /** Dừng lệnh đang chạy (bestmove sẽ được trả về sớm) */
  stop() {
    this.send('stop');
  }

  terminate() {
    this.worker.terminate();
    this.listeners.clear();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Đọc dòng "info depth ... multipv ... score ... pv ..." */
export function parseInfo(line: string): EngineLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ') || !line.includes(' score ')) return null;
  // Bỏ qua dòng bound (chưa phải điểm chính xác)
  if (line.includes(' lowerbound') || line.includes(' upperbound')) return null;
  const tok = line.split(' ');
  let depth = 0;
  let multipv = 1;
  const score: EngineScore = {};
  let pv: string[] = [];
  for (let i = 1; i < tok.length; i++) {
    switch (tok[i]) {
      case 'depth':
        depth = Number(tok[++i]);
        break;
      case 'multipv':
        multipv = Number(tok[++i]);
        break;
      case 'score': {
        const kind = tok[++i];
        const val = Number(tok[++i]);
        if (kind === 'cp') score.cp = val;
        else if (kind === 'mate') score.mate = val;
        break;
      }
      case 'pv':
        pv = tok.slice(i + 1);
        i = tok.length;
        break;
    }
  }
  return { multipv, depth, score, pv };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Hết thời gian chờ engine (${ms}ms)`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

let shared: Promise<StockfishClient> | null = null;
/** Engine dùng chung cho cả app (khởi tạo 1 lần) */
export function getEngine(): Promise<StockfishClient> {
  if (!shared) {
    shared = StockfishClient.create();
    shared.catch(() => (shared = null));
  }
  return shared;
}
