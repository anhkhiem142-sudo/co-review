// Tùy chọn người dùng trong localStorage (bọc try/catch vì có thể bị chặn ở chế độ riêng tư)
const K_USER = 'co-review:username';
const K_DEPTH = 'co-review:depth';

export type DepthPreset = 12 | 16 | 20;
export const DEPTH_PRESETS: { value: DepthPreset; label: string }[] = [
  { value: 12, label: 'Nhanh' },
  { value: 16, label: 'Chuẩn' },
  { value: 20, label: 'Sâu' },
];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* bỏ qua */
  }
}

export const getUsername = () => read(K_USER) ?? '';
export const setUsername = (u: string) => write(K_USER, u.trim());

export function getDepth(): DepthPreset {
  const v = Number(read(K_DEPTH));
  return v === 12 || v === 20 ? v : 16;
}
export const setDepth = (d: DepthPreset) => write(K_DEPTH, String(d));
