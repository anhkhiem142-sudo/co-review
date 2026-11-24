import type { Classification } from '../analysis/types';
import type { EngineScore } from '../engine/stockfishClient';

export interface ClassMeta {
  label: string;
  color: string;
  glyph: string;
}

export const CLASS_META: Record<Classification, ClassMeta> = {
  brilliant: { label: 'Tuyệt diệu', color: '#22c3b5', glyph: '!!' },
  great: { label: 'Nước hay', color: '#5a8dee', glyph: '!' },
  best: { label: 'Tốt nhất', color: '#80b64b', glyph: '★' },
  excellent: { label: 'Rất tốt', color: '#a2c86d', glyph: '✓' },
  good: { label: 'Tốt', color: '#8aa89a', glyph: '✓' },
  book: { label: 'Khai cuộc', color: '#b8977a', glyph: '≡' },
  inaccuracy: { label: 'Thiếu chính xác', color: '#eec04a', glyph: '?!' },
  mistake: { label: 'Sai lầm', color: '#f08c3a', glyph: '?' },
  miss: { label: 'Bỏ lỡ', color: '#e0628f', glyph: '✕' },
  blunder: { label: 'Sai nghiêm trọng', color: '#e5484d', glyph: '??' },
};

export function ClassIcon({ c, size = 18, title }: { c: Classification; size?: number; title?: string }) {
  const meta = CLASS_META[c];
  const fs = meta.glyph.length > 1 ? size * 0.5 : size * 0.62;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={title ?? meta.label} className="class-icon">
      <title>{title ?? meta.label}</title>
      <circle cx="10" cy="10" r="10" fill={meta.color} />
      <text
        x="10"
        y="10.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={(fs * 20) / size}
        fontWeight="800"
        fill="#fff"
        fontFamily="system-ui, sans-serif"
      >
        {meta.glyph}
      </text>
    </svg>
  );
}

/** Định dạng điểm (góc nhìn Trắng): +1.3 / −0.4 / M3 / −M2 */
export function formatEval(score: EngineScore | undefined): string {
  if (!score) return '0.0';
  if (score.mate != null) {
    if (score.mate === 0) return '#';
    return `${score.mate > 0 ? '' : '−'}M${Math.abs(score.mate)}`;
  }
  const v = (score.cp ?? 0) / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}

/** Số thứ tự nước theo ply: 0 → "1.", 1 → "1…" */
export const moveNumber = (ply: number) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;
