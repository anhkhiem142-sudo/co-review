import { describe, expect, it } from 'vitest';
import { capturedBy, commentOnOpponentMove, commentOnUserMove, describeMissed, describeThreat, formatLine, hintMessage } from '../coach';

describe('describeThreat', () => {
  it('phát hiện để mất Hậu', () => {
    // Trắng vừa đi Qa4?? — Xe a5 ăn được Hậu
    const fenAfter = '4k3/8/8/r7/Q7/8/8/4K3 b - - 1 1';
    expect(describeThreat(fenAfter, { score: { cp: 900 }, pv: ['a5a4'] })).toEqual({
      kind: 'wins',
      piece: 'Hậu',
      square: 'a4',
      san: 'Rxa4',
    });
  });
  it('đổi Hậu (vừa ăn Hậu, bị ăn lại) không bị báo là mất Hậu', () => {
    // Trắng Qd1xd5 ăn Hậu đen, Đen e6xd5 ăn lại
    const fenBefore = '4k3/8/4p3/3q4/8/8/8/3QK3 w - - 0 1';
    const fenAfter = '4k3/8/4p3/3Q4/8/8/8/4K3 b - - 0 1';
    const reply = { score: { cp: 0 }, pv: ['e6d5'] };
    expect(describeThreat(fenAfter, reply)?.kind).toBe('wins'); // không biết nước trước ăn gì → tưởng mất Hậu
    expect(describeThreat(fenAfter, reply, capturedBy(fenBefore, 'd1d5'))).toBeNull();
  });

  it('phát hiện bị chiếu hết', () => {
    const fenAfter = '6k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1'.replace(' w ', ' b ');
    const t = describeThreat(fenAfter, { score: { mate: 1 }, pv: ['a1a2'] });
    expect(t?.kind).toBe('mate');
  });
  it('đổi quân ngang giá không tính là mất quân', () => {
    // Mã đen ăn Mã trắng d5, Tốt e4 ăn lại → ngang giá
    const fenAfter = '4k3/2n5/8/3N4/4P3/8/8/4K3 b - - 0 1';
    expect(describeThreat(fenAfter, { score: { cp: 0 }, pv: ['c7d5'] })).toBeNull();
  });
});

describe('describeMissed', () => {
  it('bỏ lỡ chiếu hết', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const m = describeMissed(fen, { score: { mate: 1 }, pv: ['a1a8'] });
    expect(m).toEqual({ kind: 'mate', line: '1. Ra8#' });
  });
  it('bỏ lỡ ăn quân', () => {
    const fen = '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1';
    expect(describeMissed(fen, { score: { cp: 900 }, pv: ['d1d5'] })).toEqual({ kind: 'capture', piece: 'Hậu', san: 'Rxd5' });
  });
});

describe('formatLine', () => {
  it('đánh số đúng khi bắt đầu từ lượt Đen', () => {
    expect(formatLine('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ['e7e5', 'g1f3'])).toBe('1… e5 2. Nf3');
  });
});

describe('commentOnUserMove', () => {
  const base = { ply: 0, san: 'Qa4', uci: 'd1a4', canUndo: true };

  it('nước sai nghiêm trọng: nêu quân bị mất + nước tốt hơn + nhắc đi lại', () => {
    const m = commentOnUserMove({
      ...base,
      classification: 'blunder',
      fenBefore: '4k3/8/8/r7/8/8/8/3QK3 w - - 0 1',
      fenAfter: '4k3/8/8/r7/Q7/8/8/4K3 b - - 1 1',
      best: { score: { cp: 900 }, pv: ['d1a1'] },
      reply: { score: { cp: 900 }, pv: ['a5a4'] },
    });
    expect(m.tone).toBe('bad');
    expect(m.title).toBe('Sai nghiêm trọng!');
    expect(m.body).toContain('để mất Hậu ở a4');
    expect(m.body).toContain('Nước tốt hơn là');
    expect(m.body).toContain('Đi lại');
  });

  it('không cho đi lại thì không nhắc', () => {
    const m = commentOnUserMove({
      ...base,
      canUndo: false,
      classification: 'mistake',
      fenBefore: '4k3/8/8/r7/8/8/8/3QK3 w - - 0 1',
      fenAfter: '4k3/8/8/r7/Q7/8/8/4K3 b - - 1 1',
      best: { score: { cp: 900 }, pv: ['d1a1'] },
    });
    expect(m.body).not.toContain('Đi lại');
  });

  it('nước tốt nhất: khen', () => {
    const m = commentOnUserMove({
      ...base,
      san: 'e4',
      uci: 'e2e4',
      classification: 'best',
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      best: { score: { cp: 30 }, pv: ['e2e4'] },
    });
    expect(m.tone).toBe('good');
    expect(m.body).toContain('e4');
  });

  it('khai cuộc: nêu tên khai cuộc', () => {
    const m = commentOnUserMove({
      ...base,
      san: 'e4',
      uci: 'e2e4',
      classification: 'book',
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      opening: { eco: 'B00', name: "King's Pawn Game" },
    });
    expect(m.body).toContain("King's Pawn Game");
  });
});

describe('commentOnOpponentMove / hint', () => {
  it('máy sai → nhắc người chơi', () => {
    expect(commentOnOpponentMove('blunder', 'Qh5', 3)?.tone).toBe('info');
    expect(commentOnOpponentMove('best', 'Nf3', 3)).toBeNull();
  });
  it('gợi ý lần 1 chỉ quân, lần 2 lộ nước', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(hintMessage(fen, 'g1f3', false).body).toContain('Mã ở g1');
    expect(hintMessage(fen, 'g1f3', true).body).toContain('Nf3');
  });
});
