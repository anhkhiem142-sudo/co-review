import { Chess } from 'chess.js';

export interface ParsedMove {
  ply: number;
  san: string;
  uci: string;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  captured?: string;
}

export interface PlayerInfo {
  name: string;
  elo?: number;
}

export interface ParsedGame {
  id: string;
  headers: Record<string, string>;
  startFen: string;
  moves: ParsedMove[];
  white: PlayerInfo;
  black: PlayerInfo;
  result: string;
}

/** Hash FNV-1a ngắn gọn để làm id cho PGN dán tay */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function parsePgn(pgn: string, id?: string): ParsedGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn.trim());
  } catch (e) {
    throw new Error('PGN không hợp lệ: ' + (e as Error).message);
  }
  const headers = chess.getHeaders() as Record<string, string>;
  const history = chess.history({ verbose: true });
  if (history.length === 0) throw new Error('Ván cờ không có nước đi nào.');

  const moves: ParsedMove[] = history.map((m, i) => ({
    ply: i,
    san: m.san,
    uci: m.from + m.to + (m.promotion ?? ''),
    color: m.color,
    fenBefore: m.before,
    fenAfter: m.after,
    captured: m.captured,
  }));

  const elo = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return {
    id: id ?? 'pgn-' + hashString(pgn.trim()),
    headers,
    startFen: history[0].before,
    moves,
    white: { name: headers.White ?? 'Trắng', elo: elo(headers.WhiteElo) },
    black: { name: headers.Black ?? 'Đen', elo: elo(headers.BlackElo) },
    result: headers.Result ?? '*',
  };
}

/** Danh sách FEN của N+1 thế cờ (trước nước 1 … sau nước N) */
export function positionsOf(game: ParsedGame): string[] {
  return [game.startFen, ...game.moves.map((m) => m.fenAfter)];
}
