import { openDB, type IDBPDatabase } from 'idb';
import type { PositionEval } from '../analysis/review';

// Cache kết quả engine (điểm thô của từng thế cờ) trong IndexedDB.
// Lưu điểm thô thay vì kết quả phân loại → đổi config phân loại không cần phân tích lại.

interface CachedAnalysis {
  key: string;
  gameId: string;
  depth: number;
  positions: PositionEval[];
  engine: string;
  createdAt: number;
}

const DB_NAME = 'co-review';
const STORE = 'analyses';
let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      const s = d.createObjectStore(STORE, { keyPath: 'key' });
      s.createIndex('gameId', 'gameId');
    },
  });
  return dbPromise;
}

const DEPTHS = [20, 16, 12];

/** Lấy kết quả đã cache với độ sâu ≥ yêu cầu (ưu tiên sâu nhất). Lỗi IndexedDB → null. */
export async function getCachedAnalysis(
  gameId: string,
  minDepth: number,
  positionCount: number,
): Promise<{ depth: number; positions: PositionEval[] } | null> {
  try {
    const d = await db();
    for (const depth of DEPTHS.filter((x) => x >= minDepth)) {
      const hit = (await d.get(STORE, `${gameId}|${depth}`)) as CachedAnalysis | undefined;
      if (hit && hit.positions.length === positionCount) return { depth: hit.depth, positions: hit.positions };
    }
  } catch (e) {
    console.warn('[cache] Không đọc được IndexedDB', e);
  }
  return null;
}

export async function putCachedAnalysis(gameId: string, depth: number, positions: PositionEval[], engine: string) {
  try {
    const d = await db();
    const rec: CachedAnalysis = { key: `${gameId}|${depth}`, gameId, depth, positions, engine, createdAt: Date.now() };
    await d.put(STORE, rec);
  } catch (e) {
    console.warn('[cache] Không ghi được IndexedDB', e);
  }
}

/** Danh sách id ván đã phân tích (để đánh dấu trong danh sách ván) */
export async function analyzedGameIds(): Promise<Set<string>> {
  try {
    const d = await db();
    const keys = (await d.getAllKeys(STORE)) as string[];
    return new Set(keys.map((k) => k.split('|')[0]));
  } catch {
    return new Set();
  }
}
