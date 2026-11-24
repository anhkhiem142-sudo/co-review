import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { isRecapture, sacrificeValue, see } from '../material';

describe('see', () => {
  it('quân không được bảo vệ → ăn được trọn', () => {
    const c = new Chess('4k3/8/8/3n4/8/4N3/8/4K3 w - - 0 1');
    expect(see(c, 'd5')).toBe(3);
  });
  it('mã được tốt bảo vệ → đổi mã lấy mã = 0', () => {
    const c = new Chess('4k3/8/4p3/3n4/8/4N3/8/4K3 w - - 0 1');
    expect(see(c, 'd5')).toBe(0);
  });
  it('ô trống → 0', () => {
    expect(see(new Chess(), 'e4')).toBe(0);
  });
});

describe('sacrificeValue', () => {
  it('Hậu ăn tốt có vua bảo vệ → thí hậu (8)', () => {
    expect(sacrificeValue('4k3/3p4/8/8/8/8/8/3QK3 w - - 0 1', 'd1d7')).toBe(8);
  });
  it('đổi mã ngang giá → không phải thí quân', () => {
    expect(sacrificeValue('4k3/8/4p3/3n4/8/4N3/8/4K3 w - - 0 1', 'e3d5')).toBeLessThanOrEqual(0);
  });
  it('đưa tượng vào ô bị tốt ăn → thí 3', () => {
    expect(sacrificeValue('4k3/8/8/3p4/8/5B2/8/4K3 w - - 0 1', 'f3e4')).toBe(3);
  });
  it('nước bình thường ở khai cuộc → không thí', () => {
    expect(sacrificeValue(new Chess().fen(), 'e2e4')).toBeLessThanOrEqual(0);
  });
  it('quân đã treo từ trước không bị tính là thí', () => {
    // Mã e5 của Trắng đã bị tốt d6 ăn được từ trước; Trắng đi tốt a2-a3 → không phải "thí"
    expect(sacrificeValue('4k3/8/3p4/4N3/8/8/P7/4K3 w - - 0 1', 'a2a3')).toBeLessThanOrEqual(0);
  });
  it('nước chiếu hết → 0', () => {
    expect(sacrificeValue('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8')).toBe(0);
  });
});

describe('isRecapture', () => {
  it('ăn lại đúng ô', () => {
    expect(isRecapture('d1d5', 'c6d5', true)).toBe(true);
    expect(isRecapture('d1d5', 'c6d5', false)).toBe(false);
    expect(isRecapture('d1d4', 'c6d5', true)).toBe(false);
  });
});
