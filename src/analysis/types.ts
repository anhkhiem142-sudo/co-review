export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/** Thứ tự hiển thị trong bảng tổng kết */
export const CLASSIFICATION_ORDER: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

/** Các loại tính là "nước sai" (dùng cho nút nhảy tới nước sai tiếp theo) */
export const ERROR_CLASSES: Classification[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];
