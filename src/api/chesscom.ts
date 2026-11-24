// Gọi API công khai của chess.com (https://www.chess.com/news/view/published-data-api).
// API trả CORS "*" nên gọi thẳng được từ trình duyệt, kể cả khi trang bật COEP.

const API = 'https://api.chess.com/pub/player/';

export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily';

interface ApiPlayer {
  username: string;
  rating: number;
  result: string;
}

interface ApiGame {
  url: string;
  pgn?: string;
  uuid: string;
  time_control: string;
  time_class: TimeClass;
  end_time: number;
  rated: boolean;
  rules: string;
  white: ApiPlayer;
  black: ApiPlayer;
}

export interface GameSummary {
  id: string;
  url: string;
  pgn: string;
  timeClass: TimeClass;
  timeControl: string;
  /** epoch ms */
  endTime: number;
  rated: boolean;
  myColor: 'w' | 'b';
  outcome: 'win' | 'loss' | 'draw';
  me: { username: string; rating: number };
  opponent: { username: string; rating: number };
}

export class ChessComError extends Error {}

const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

/** Danh sách URL lưu trữ theo tháng, cũ → mới */
export async function fetchArchives(username: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${API}${encodeURIComponent(username.trim().toLowerCase())}/games/archives`);
  } catch {
    throw new ChessComError('Không kết nối được chess.com. Kiểm tra mạng rồi thử lại.');
  }
  if (res.status === 404) throw new ChessComError(`Không tìm thấy người chơi "${username}" trên chess.com.`);
  if (res.status === 429) throw new ChessComError('chess.com đang giới hạn số lượt gọi. Đợi một chút rồi thử lại.');
  if (!res.ok) throw new ChessComError(`chess.com trả lỗi ${res.status}. Thử lại sau.`);
  const json = (await res.json()) as { archives?: string[] };
  return json.archives ?? [];
}

/** Các ván (cờ vua thường) trong 1 tháng, mới nhất trước */
export async function fetchMonthGames(archiveUrl: string, username: string): Promise<GameSummary[]> {
  let res: Response;
  try {
    res = await fetch(archiveUrl);
  } catch {
    throw new ChessComError('Không tải được danh sách ván. Kiểm tra mạng rồi thử lại.');
  }
  if (!res.ok) throw new ChessComError(`chess.com trả lỗi ${res.status} khi tải ván.`);
  const json = (await res.json()) as { games?: ApiGame[] };
  const me = username.trim().toLowerCase();
  return (json.games ?? [])
    .filter((g) => g.rules === 'chess' && g.pgn)
    .map((g): GameSummary => {
      const myColor = g.white.username.toLowerCase() === me ? 'w' : 'b';
      const mine = myColor === 'w' ? g.white : g.black;
      const opp = myColor === 'w' ? g.black : g.white;
      const outcome = mine.result === 'win' ? 'win' : DRAW_RESULTS.has(mine.result) ? 'draw' : 'loss';
      return {
        id: g.uuid || g.url,
        url: g.url,
        pgn: g.pgn!,
        timeClass: g.time_class,
        timeControl: g.time_control,
        endTime: g.end_time * 1000,
        rated: g.rated,
        myColor,
        outcome,
        me: { username: mine.username, rating: mine.rating },
        opponent: { username: opp.username, rating: opp.rating },
      };
    })
    .sort((a, b) => b.endTime - a.endTime);
}

export const TIME_CLASS_LABEL: Record<TimeClass, string> = {
  bullet: 'Siêu chớp',
  blitz: 'Chớp',
  rapid: 'Nhanh',
  daily: 'Hàng ngày',
};

/** "180+2" → "3+2", "600" → "10 phút", "1/86400" → "1 ngày/nước" */
export function formatTimeControl(tc: string): string {
  if (tc.includes('/')) {
    const secs = Number(tc.split('/')[1]);
    return `${Math.round(secs / 86400)} ngày/nước`;
  }
  const [base, inc] = tc.split('+').map(Number);
  const min = base >= 60 ? `${+(base / 60).toFixed(1)}` : `${base}s`;
  return inc ? `${min}+${inc}` : base >= 60 ? `${min} phút` : min;
}

/** ".../games/2026/11" → "Tháng 11/2026" */
export function archiveLabel(url: string): string {
  const m = url.match(/(\d{4})\/(\d{2})$/);
  return m ? `Tháng ${Number(m[2])}/${m[1]}` : url;
}
