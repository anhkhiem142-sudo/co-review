import { describe, expect, it } from 'vitest';
import { explainLine, formatSans, materialBalance, materialSwing, stepNumber } from '../lineExplain';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('materialBalance', () => {
  it('thế ban đầu cân bằng', () => {
    expect(materialBalance(START, 'w')).toBe(0);
  });
  it('tính theo góc nhìn từng bên', () => {
    const fen = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1';
    expect(materialBalance(fen, 'w')).toBe(9);
    expect(materialBalance(fen, 'b')).toBe(-9);
  });
});

describe('explainLine', () => {
  it('chú thích ăn quân và tổng kết mất quân', () => {
    // 1. e4 e6 2. Ba6?? Nxa6 — xem từ góc nhìn Trắng, bắt đầu sau 1...e6
    const fen = 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const r = explainLine(fen, ['f1a6', 'b8a6'], 'w');
    expect(r.steps.map((s) => s.san)).toEqual(['Ba6', 'Nxa6']);
    expect(r.steps[0].isMe).toBe(true);
    expect(r.steps[1].isMe).toBe(false);
    expect(r.steps[1].notes).toContain('ăn Tượng ở a6');
    expect(r.steps[1].balance).toBe(-3);
    expect(r.summary).toContain('Bạn mất 1 Tượng');
    expect(r.summary).toContain('thiệt 3 điểm quân');
  });

  it('đổi quân ngang giá → nói quân số vẫn ngang nhau', () => {
    // 1. e4 d5 2. exd5 Qxd5
    const r = explainLine(START, ['e2e4', 'd7d5', 'e4d5', 'd8d5'], 'w');
    expect(r.steps).toHaveLength(4);
    expect(r.summary).toContain('ngang nhau');
  });

  it('nhận ra chiếu và chiếu hết', () => {
    // Chiếu hết kiểu "Fool's mate": 1. f3 e5 2. g4 Qh4#
    const r = explainLine(START, ['f2f3', 'e7e5', 'g2g4', 'd8h4'], 'w');
    expect(r.steps[3].notes).toContain('chiếu hết!');
    expect(r.summary).toBe('Bạn bị chiếu hết sau 4 nước (2… Qh4#).');
    expect(r.keyIndex).toBe(3);
    const r2 = explainLine(START, ['f2f3', 'e7e5', 'g2g4', 'd8h4'], 'b');
    expect(r2.summary).toBe('Bạn chiếu hết sau 4 nước (2… Qh4#).');
  });

  it('dừng ở nước không hợp lệ và giới hạn số nước', () => {
    expect(explainLine(START, ['e2e4', 'e2e4'], 'w').steps).toHaveLength(1);
    expect(explainLine(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 'w', 2).steps).toHaveLength(2);
  });

  it('đánh số nước đúng khi bắt đầu từ lượt Đen', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const r = explainLine(fen, ['e7e5', 'g1f3'], 'w');
    expect(r.steps.map((s) => stepNumber(s.ply))).toEqual(['1…', '2.']);
  });

  it('materialSwing: đòn mất quân sau vài nước', () => {
    // Sau 1. e4 e6 2. Ba6 — biến Nxa6: Trắng mất 1 Tượng
    const fen = 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const sw = materialSwing(fen, ['f1a6', 'b8a6', 'd2d4', 'd7d5'], 'w');
    expect(sw.diff).toBe(-3);
    expect(sw.ownLost).toBe('1 Tượng');
    expect(sw.oppLost).toBe('');
    expect(formatSans(sw.startPly, sw.sans)).toBe('2. Ba6 Nxa6 3. d4 d5');
  });

  it('không dừng giữa lúc đổi quân: đi tiếp tới khi ăn lại xong', () => {
    // maxPlies = 3 sẽ dừng ở exd5 (vừa ăn), phải đi tiếp Qxd5
    const r = explainLine(START, ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a5'], 'w', 3);
    expect(r.steps.map((s) => s.san)).toEqual(['e4', 'd5', 'exd5', 'Qxd5']);
    expect(r.endBalance).toBe(0);
    expect(r.settled).toBe(false);
  });

  it('biến của engine hết đúng lúc vừa ăn → tính thêm nước ăn lại', () => {
    // 4. d4?? kiểu biến dừng ở "Qxd8+": ở đây biến dừng ở exd5, Đen ăn lại được bằng Hậu
    const r = explainLine(START, ['e2e4', 'd7d5', 'e4d5'], 'w', 10);
    expect(r.steps.at(-1)?.san).toBe('exd5');
    expect(r.steps.at(-1)?.balance).toBe(1);
    expect(r.endBalance).toBe(0);
    expect(r.settled).toBe(true);
    expect(r.summary).toContain('ngang nhau');
  });

  it('materialSwing dùng điểm quân đã ngã ngũ', () => {
    expect(materialSwing(START, ['e2e4', 'd7d5', 'e4d5'], 'w').diff).toBe(0);
  });

  it('thời điểm ngã ngũ: nước cuối làm quân số thay đổi, không cắt ở 10 nước', () => {
    // Mất Tượng ở nước thứ 2, sau đó đi thêm 12 nước "yên" — kết quả rõ từ nước 2
    const fen = 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const quiet = ['d2d4', 'd7d5', 'g1f3', 'g8f6', 'b1c3', 'f8e7', 'c1e3', 'e8g8', 'd1d2', 'c7c6', 'e1c1', 'a6c7'];
    const r = explainLine(fen, ['f1a6', 'b8a6', ...quiet], 'w');
    expect(r.steps).toHaveLength(14); // không bị cắt ở 10
    expect(r.keyIndex).toBe(1);
    expect(r.summary.startsWith('Sau 2 nước (đến 2… Nxa6): Bạn mất 1 Tượng')).toBe(true);
    const sw = materialSwing(fen, ['f1a6', 'b8a6', ...quiet], 'w');
    expect(sw.keyPlies).toBe(2);
    expect(sw.diff).toBe(-3);
  });

  it('quân số không đổi → không có thời điểm ngã ngũ', () => {
    const r = explainLine(START, ['e2e4', 'd7d5', 'e4d5', 'd8d5'], 'w');
    expect(r.keyIndex).toBeNull();
    expect(r.summary.startsWith('Sau cả 4 nước của biến')).toBe(true);
  });

  it('biến rỗng', () => {
    expect(explainLine(START, [], 'w').summary).toBe('Không có biến để hiển thị.');
  });
});
