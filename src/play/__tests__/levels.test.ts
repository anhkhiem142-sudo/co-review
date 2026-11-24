import { describe, expect, it } from 'vitest';
import { LEVELS, getLevel, pickMove, uciOptionsFor } from '../levels';

const lines = [
  { score: { cp: 100 }, pv: ['e2e4'] },
  { score: { cp: 60 }, pv: ['d2d4'] },
  { score: { cp: -300 }, pv: ['g2g4'] },
];
const legal = ['e2e4', 'd2d4', 'g2g4', 'a2a3'];

/** rng trả lần lượt các giá trị cho trước */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('LEVELS', () => {
  it('có 7 mức, Elo tăng dần, id không trùng', () => {
    expect(LEVELS).toHaveLength(7);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].elo).toBeGreaterThan(LEVELS[i - 1].elo);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });
  it('mức UCI có Elo nằm trong khoảng Stockfish hỗ trợ (1320–3190)', () => {
    for (const l of LEVELS.filter((x) => x.mode === 'uci')) {
      expect(l.uciElo).toBeGreaterThanOrEqual(1320);
      expect(l.uciElo).toBeLessThanOrEqual(3190);
    }
  });
  it('getLevel trả mức mặc định khi id lạ', () => {
    expect(getLevel('khong-co').id).toBe('basic');
  });
  it('uciOptionsFor bật/tắt LimitStrength đúng', () => {
    expect(uciOptionsFor(getLevel('good'))).toMatchObject({ UCI_LimitStrength: true, UCI_Elo: 1600 });
    expect(uciOptionsFor(getLevel('newbie'))).toMatchObject({ UCI_LimitStrength: false });
  });
});

describe('pickMove', () => {
  it('mức uci/max luôn đi nước số 1', () => {
    expect(pickMove(lines, legal, getLevel('good'), seq(0))).toBe('e2e4');
    expect(pickMove(lines, legal, getLevel('max'), seq(0))).toBe('e2e4');
  });

  it('mức weak: rng nhỏ hơn randomChance → đi nước hợp lệ bất kỳ', () => {
    const lvl = getLevel('newbie'); // randomChance 0.3
    expect(pickMove(lines, legal, lvl, seq(0.1, 0.99))).toBe('a2a3');
  });

  it('mức weak: không ngẫu nhiên → chọn theo trọng số, rng nhỏ → nước tốt nhất', () => {
    const lvl = getLevel('medium');
    expect(pickMove(lines, legal, lvl, seq(0.99, 0))).toBe('e2e4');
  });

  it('nước kém hơn nhiều gần như không bao giờ được chọn ở mức Trung bình', () => {
    const lvl = { ...getLevel('medium'), randomChance: 0 };
    let worst = 0;
    for (let k = 0; k < 1000; k++) if (pickMove(lines, legal, lvl, Math.random) === 'g2g4') worst++;
    expect(worst).toBeLessThan(10);
  });

  it('mức Người mới thỉnh thoảng chọn nước thứ 2', () => {
    const lvl = { ...getLevel('newbie'), randomChance: 0 };
    let second = 0;
    for (let k = 0; k < 1000; k++) if (pickMove(lines, legal, lvl, Math.random) === 'd2d4') second++;
    expect(second).toBeGreaterThan(200);
  });

  it('không có biến nào → nước hợp lệ đầu tiên', () => {
    expect(pickMove([], legal, getLevel('basic'), seq(0.99))).toBe('e2e4');
    expect(pickMove([], [], getLevel('basic'), seq(0.99))).toBeNull();
  });
});
