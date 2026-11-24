// Dữ liệu khai cuộc: lichess-org/chess-openings (CC0), sinh bằng `npm run eco`.
export type EcoMap = Record<string, [eco: string, name: string]>;

export interface Opening {
  eco: string;
  name: string;
}

let ecoPromise: Promise<EcoMap> | null = null;

/** Tải dữ liệu ECO (lazy, ~460KB, chỉ tải khi cần) */
export function loadEco(): Promise<EcoMap> {
  ecoPromise ??= import('../data/eco.json').then((m) => m.default as unknown as EcoMap);
  return ecoPromise;
}

/** EPD = 4 trường đầu của FEN (bỏ đếm nước) */
export const toEpd = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function lookupOpening(eco: EcoMap | undefined, fen: string): Opening | undefined {
  const hit = eco?.[toEpd(fen)];
  return hit ? { eco: hit[0], name: hit[1] } : undefined;
}
