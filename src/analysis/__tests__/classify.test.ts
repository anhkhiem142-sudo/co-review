import { describe, expect, it } from 'vitest';
import { classifyMove, classifyByLoss } from '../classify';
import { expectedPoints, moveAccuracy, negateScore, scoreToCp, winPercent } from '../winProb';
import { gameAccuracy, harmonicMean, volatilityWeights } from '../accuracy';

describe('winProb', () => {
  it('cp 0 → 50%', () => {
    expect(winPercent(0)).toBeCloseTo(50, 6);
  });

  it('đối xứng: W(cp) + W(-cp) = 100', () => {
    for (const cp of [35, 120, 400, 1500]) expect(winPercent(cp) + winPercent(-cp)).toBeCloseTo(100, 6);
  });

  it('tăng dần theo cp', () => {
    expect(winPercent(100)).toBeGreaterThan(winPercent(50));
    expect(winPercent(100)).toBeCloseTo(59.1, 1);
  });

  it('mate quy đổi ±10000cp', () => {
    expect(scoreToCp({ mate: 3 })).toBe(10000);
    expect(scoreToCp({ mate: -2 })).toBe(-10000);
    expect(scoreToCp({ mate: 0 })).toBe(-10000);
    expect(expectedPoints({ mate: 5 })).toBeCloseTo(1, 6);
    expect(expectedPoints({ mate: -5 })).toBeCloseTo(0, 6);
  });

  it('negateScore', () => {
    expect(negateScore({ cp: 50 })).toEqual({ cp: -50 });
    expect(negateScore({ mate: 2 })).toEqual({ mate: -2 });
  });
});

describe('moveAccuracy', () => {
  it('không mất gì → ~100', () => {
    expect(moveAccuracy(0)).toBeCloseTo(99.9999, 3);
  });
  it('kẹp trong [0, 100]', () => {
    expect(moveAccuracy(100)).toBe(0);
    expect(moveAccuracy(-5)).toBeLessThanOrEqual(100);
  });
  it('giảm dần theo độ mất', () => {
    expect(moveAccuracy(10)).toBeLessThan(moveAccuracy(5));
    expect(moveAccuracy(10)).toBeCloseTo(63.58, 1);
  });
});

describe('classifyByLoss — ngưỡng', () => {
  const cases: [number, string][] = [
    [0, 'best'],
    [0.01, 'excellent'],
    [0.02, 'excellent'],
    [0.03, 'good'],
    [0.05, 'good'],
    [0.08, 'inaccuracy'],
    [0.1, 'inaccuracy'],
    [0.15, 'mistake'],
    [0.2, 'mistake'],
    [0.21, 'blunder'],
    [0.6, 'blunder'],
  ];
  it.each(cases)('loss %f → %s', (loss, expected) => {
    expect(classifyByLoss(loss, false)).toBe(expected);
  });
  it('trùng nước engine luôn là best', () => {
    expect(classifyByLoss(0.03, true)).toBe('best');
  });
});

describe('classifyMove', () => {
  it('tính loss = EP(best) − EP(played), không âm', () => {
    expect(classifyMove({ epBest: 0.6, epPlayed: 0.45, isEngineBest: false }).loss).toBeCloseTo(0.15, 9);
    expect(classifyMove({ epBest: 0.6, epPlayed: 0.62, isEngineBest: false }).loss).toBe(0);
  });

  it('Book được ưu tiên', () => {
    expect(classifyMove({ epBest: 0.55, epPlayed: 0.3, isEngineBest: false, isBook: true }).classification).toBe('book');
  });

  describe('Brilliant', () => {
    const base = { epBest: 0.55, epPlayed: 0.55, isEngineBest: true, sacrifice: 3, epSecond: 0.5 };
    it('thí quân + nước tốt nhất + thế cờ cân bằng → brilliant', () => {
      expect(classifyMove(base).classification).toBe('brilliant');
    });
    it('không thí quân → không brilliant', () => {
      expect(classifyMove({ ...base, sacrifice: 0 }).classification).toBe('best');
    });
    it('chỉ thí 1 tốt → không brilliant (mặc định cần ≥ 2)', () => {
      expect(classifyMove({ ...base, sacrifice: 1 }).classification).toBe('best');
    });
    it('đang thắng quá dễ (EP > 0.9) → không brilliant', () => {
      expect(classifyMove({ ...base, epBest: 0.95, epPlayed: 0.95, epSecond: 0.94 }).classification).toBe('best');
    });
    it('đang thua (EP < 0.2) → không brilliant', () => {
      expect(classifyMove({ ...base, epBest: 0.1, epPlayed: 0.1, epSecond: 0.05 }).classification).toBe('best');
    });
    it('gần tốt nhất (loss ≤ 0.02) vẫn tính', () => {
      expect(classifyMove({ ...base, isEngineBest: false, epPlayed: 0.54 }).classification).toBe('brilliant');
    });
    it('thí quân nhưng là nước sai → không brilliant', () => {
      expect(classifyMove({ ...base, isEngineBest: false, epPlayed: 0.3 }).classification).toBe('blunder');
    });
    it('nước bắt buộc → không brilliant', () => {
      expect(classifyMove({ ...base, legalMoveCount: 1 }).classification).toBe('best');
    });
  });

  describe('Great', () => {
    const base = { epBest: 0.55, epSecond: 0.3, epPlayed: 0.55, isEngineBest: true };
    it('nước tốt thứ 2 kém > 0.10 → great', () => {
      expect(classifyMove(base).classification).toBe('great');
    });
    it('khoảng cách nhỏ → best', () => {
      expect(classifyMove({ ...base, epSecond: 0.5 }).classification).toBe('best');
    });
    it('đúng 0.10 → chưa đủ (cần > 0.10)', () => {
      expect(classifyMove({ ...base, epBest: 0.6, epPlayed: 0.6, epSecond: 0.5 }).classification).toBe('best');
    });
    it('ăn lại quân hiển nhiên → best', () => {
      expect(classifyMove({ ...base, isRecapture: true }).classification).toBe('best');
    });
    it('không có biến thứ 2 → best', () => {
      expect(classifyMove({ ...base, epSecond: undefined }).classification).toBe('best');
    });
  });

  describe('Miss', () => {
    // Đối thủ có EP 0.5 trước khi blunder → EP của mình lúc đó = 0.5; sau blunder mình có cơ hội lên 0.9
    const prev = { classification: 'blunder' as const, epBest: 0.5 };
    it('bỏ lỡ cơ hội nhưng không tệ hơn trước → miss', () => {
      expect(classifyMove({ epBest: 0.9, epPlayed: 0.55, isEngineBest: false, prev }).classification).toBe('miss');
    });
    it('bỏ lỡ và còn tệ hơn hẳn → vẫn là blunder', () => {
      expect(classifyMove({ epBest: 0.9, epPlayed: 0.2, isEngineBest: false, prev }).classification).toBe('blunder');
    });
    it('độ mất < 0.10 → không phải miss', () => {
      expect(classifyMove({ epBest: 0.9, epPlayed: 0.85, isEngineBest: false, prev }).classification).toBe('good');
    });
    it('đối thủ chỉ inaccuracy → không xét miss', () => {
      const p2 = { classification: 'inaccuracy' as const, epBest: 0.5 };
      expect(classifyMove({ epBest: 0.9, epPlayed: 0.55, isEngineBest: false, prev: p2 }).classification).toBe(
        'blunder',
      );
    });
  });
});

describe('accuracy cả ván', () => {
  it('harmonicMean phạt nước tệ mạnh hơn trung bình cộng', () => {
    expect(harmonicMean([100, 100, 10])).toBeLessThan((100 + 100 + 10) / 3);
    expect(harmonicMean([0])).toBe(1); // kẹp tối thiểu 1 để tránh chia 0
  });

  it('số trọng số = số nước', () => {
    const wins = Array.from({ length: 41 }, (_, i) => 50 + Math.sin(i) * 10);
    expect(volatilityWeights(wins)).toHaveLength(40);
    for (const w of volatilityWeights(wins)) {
      expect(w).toBeGreaterThanOrEqual(0.5);
      expect(w).toBeLessThanOrEqual(12);
    }
  });

  it('toàn nước hoàn hảo → ~100 cho cả hai bên', () => {
    const accs = Array(20).fill(100);
    const wins = Array(21).fill(50);
    const r = gameAccuracy(accs, wins);
    expect(r.white).toBeCloseTo(100, 5);
    expect(r.black).toBeCloseTo(100, 5);
  });

  it('tách đúng nước Trắng / Đen', () => {
    const accs = [100, 50, 100, 50, 100, 50];
    const wins = Array(7).fill(50);
    const r = gameAccuracy(accs, wins);
    expect(r.white).toBeCloseTo(100, 5);
    expect(r.black).toBeCloseTo(50, 5);
  });
});
