import { CLASSIFY_CONFIG } from './config';
import type { EngineScore } from '../engine/stockfishClient';

/** Đổi điểm engine sang centipawn; mate coi như ±mateCp. Góc nhìn giữ nguyên. */
export function scoreToCp(score: EngineScore, cfg = CLASSIFY_CONFIG): number {
  if (score.mate != null) return score.mate > 0 ? cfg.mateCp : -cfg.mateCp;
  return score.cp ?? 0;
}

/** Win% (0..100) theo góc nhìn của bên có điểm cp */
export function winPercent(cp: number, cfg = CLASSIFY_CONFIG): number {
  return 50 + 50 * (2 / (1 + Math.exp(-cfg.winProbK * cp)) - 1);
}

/** Expected points (0..1) */
export function expectedPoints(score: EngineScore, cfg = CLASSIFY_CONFIG): number {
  return winPercent(scoreToCp(score, cfg), cfg) / 100;
}

/** Đảo góc nhìn: điểm của bên này → điểm của bên kia */
export function negateScore(score: EngineScore): EngineScore {
  if (score.mate != null) return { mate: -score.mate };
  return { cp: -(score.cp ?? 0) };
}

/** Accuracy của 1 nước theo độ mất Win% (0..100 điểm phần trăm) */
export function moveAccuracy(winPercentLoss: number, cfg = CLASSIFY_CONFIG): number {
  const { a, b, c } = cfg.accuracy;
  const acc = a * Math.exp(-b * Math.max(0, winPercentLoss)) - c;
  return Math.min(100, Math.max(0, acc));
}
