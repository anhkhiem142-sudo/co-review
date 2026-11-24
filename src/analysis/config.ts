// ============================================================
//  CẤU HÌNH PHÂN LOẠI NƯỚC ĐI — chỉnh các ngưỡng tại đây.
//  Mọi "độ mất" (loss) tính bằng Expected Points (0..1),
//  tức là Win% / 100 theo góc nhìn người vừa đi.
// ============================================================

export const CLASSIFY_CONFIG = {
  /** Điểm mate quy đổi sang centipawn */
  mateCp: 10000,
  /** Hệ số trong công thức Win% = 50 + 50 * (2 / (1 + exp(-k * cp)) - 1) */
  winProbK: 0.00368208,

  /** Ngưỡng độ mất (≤) cho từng loại. Lớn hơn `mistake` là Blunder. */
  thresholds: {
    excellent: 0.02,
    good: 0.05,
    inaccuracy: 0.1,
    mistake: 0.2,
  },

  brilliant: {
    /** Nước phải là tốt nhất hoặc gần tốt nhất (độ mất ≤ giá trị này) */
    maxLoss: 0.02,
    /** EP của người đi trước nước đi phải nằm trong khoảng này (không đang thua, chưa thắng quá dễ) */
    minEpBefore: 0.2,
    maxEpBefore: 0.9,
    /** Giá trị quân thí tối thiểu (tính theo điểm quân, sau khi trừ quân vừa ăn được) */
    minSacrifice: 2,
  },

  great: {
    /** Nước phải là tốt nhất hoặc gần tốt nhất */
    maxLoss: 0.02,
    /** Nước tốt thứ 2 phải kém nước tốt nhất hơn mức này → "nước duy nhất" */
    minGapToSecond: 0.1,
    /** Không tính Great cho nước ăn lại quân hiển nhiên (ăn lại ở ô đối thủ vừa ăn) */
    excludeRecapture: true,
  },

  miss: {
    /** Đối thủ vừa mắc lỗi thuộc các loại này... */
    afterOpponent: ['mistake', 'blunder'] as const,
    /** ...và nước của mình mất ít nhất ngần này */
    minLoss: 0.1,
    /**
     * Chỉ là Miss nếu sau nước đi mình KHÔNG tệ hơn trước khi đối thủ mắc lỗi
     * (sai số cho phép). Nếu tệ hơn hẳn → vẫn tính Inaccuracy/Mistake/Blunder như thường.
     */
    tolerance: 0.02,
  },

  accuracy: {
    /** Accuracy mỗi nước = a * exp(-b * lossWin%) - c, kẹp [0, 100] */
    a: 103.1668,
    b: 0.04354,
    c: 3.1669,
    /** 'lichess' = (trung bình có trọng số theo độ biến động + trung bình điều hòa) / 2; 'mean' = trung bình cộng */
    method: 'lichess' as 'lichess' | 'mean',
  },

  /** Giá trị quân dùng để phát hiện thí quân */
  pieceValues: { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as Record<string, number>,
};

export type ClassifyConfig = typeof CLASSIFY_CONFIG;
