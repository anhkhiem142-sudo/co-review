import { CLASSIFY_CONFIG } from './config';
import type { Classification } from './types';

export interface ClassifyInput {
  /** EP (0..1) của nước tốt nhất theo engine, góc nhìn người đi */
  epBest: number;
  /** EP của nước tốt thứ 2 (MultiPV 2), nếu có */
  epSecond?: number;
  /** EP sau nước đã đi, góc nhìn người đi */
  epPlayed: number;
  /** Nước đã đi trùng nước engine đề xuất */
  isEngineBest: boolean;
  /** Nước còn nằm trong lý thuyết khai cuộc */
  isBook?: boolean;
  /** Giá trị quân thí (xem material.ts). Chỉ cần khi muốn xét Brilliant. */
  sacrifice?: number;
  /** Nước ăn lại ở ô đối thủ vừa ăn */
  isRecapture?: boolean;
  /** Số nước hợp lệ (1 = nước bắt buộc → không xét Great/Brilliant) */
  legalMoveCount?: number;
  /** Nước ngay trước đó của đối thủ */
  prev?: {
    classification: Classification;
    /** EP tốt nhất của đối thủ trước khi họ đi (góc nhìn đối thủ) */
    epBest: number;
  };
}

export interface ClassifyResult {
  classification: Classification;
  /** Độ mất EP (0..1), luôn ≥ 0 */
  loss: number;
}

/** Phân loại theo độ mất thuần túy */
export function classifyByLoss(loss: number, isEngineBest: boolean, cfg = CLASSIFY_CONFIG): Classification {
  const t = cfg.thresholds;
  if (isEngineBest || loss <= 0) return 'best';
  if (loss <= t.excellent) return 'excellent';
  if (loss <= t.good) return 'good';
  if (loss <= t.inaccuracy) return 'inaccuracy';
  if (loss <= t.mistake) return 'mistake';
  return 'blunder';
}

export function classifyMove(input: ClassifyInput, cfg = CLASSIFY_CONFIG): ClassifyResult {
  // Làm tròn 1e-9 để tránh lỗi số thực ở đúng ngưỡng (vd. 0.9 − 0.85 = 0.05000000000000004)
  const loss = input.isEngineBest ? 0 : Math.max(0, Math.round((input.epBest - input.epPlayed) * 1e9) / 1e9);
  if (input.isBook) return { classification: 'book', loss };

  const forced = input.legalMoveCount === 1;

  // Brilliant: thí quân, là nước tốt nhất/gần tốt nhất, thế cờ không thua và chưa thắng quá dễ
  const b = cfg.brilliant;
  if (
    !forced &&
    loss <= b.maxLoss &&
    (input.sacrifice ?? 0) >= b.minSacrifice &&
    input.epBest >= b.minEpBefore &&
    input.epBest <= b.maxEpBefore
  ) {
    return { classification: 'brilliant', loss };
  }

  // Great: nước duy nhất giữ được thế cờ
  const g = cfg.great;
  if (
    !forced &&
    loss <= g.maxLoss &&
    input.epSecond != null &&
    input.epBest - input.epSecond > g.minGapToSecond &&
    !(g.excludeRecapture && input.isRecapture)
  ) {
    return { classification: 'great', loss };
  }

  // Miss: đối thủ vừa mắc lỗi nhưng mình không tận dụng
  const m = cfg.miss;
  const prev = input.prev;
  if (prev && (m.afterOpponent as readonly string[]).includes(prev.classification) && loss >= m.minLoss) {
    const baseline = 1 - prev.epBest; // EP của mình trước khi đối thủ mắc lỗi
    if (input.epPlayed >= baseline - m.tolerance) return { classification: 'miss', loss };
  }

  return { classification: classifyByLoss(loss, input.isEngineBest, cfg), loss };
}
