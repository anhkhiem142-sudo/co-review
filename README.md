# Cờ Review

Web app xem lại và phân tích ván cờ vua sau khi chơi trên chess.com. Toàn bộ phân tích chạy **ngay trên trình duyệt** bằng Stockfish (WebAssembly) — không cần backend, không cần đăng nhập.

## Tính năng

- Nhập username chess.com → danh sách ván gần nhất (đối thủ, Elo, màu quân, kết quả, thể thức, ngày), nút **Tải thêm tháng trước**. Hoặc dán PGN thủ công.
- Phân tích từng thế cờ bằng Stockfish 19 (MultiPV 2), 3 mức độ sâu: **Nhanh** (12), **Chuẩn** (16), **Sâu** (20), có thanh tiến trình.
- Kết quả được lưu trong IndexedDB: mở lại ván không phải phân tích lại.
- Màn hình review: bàn cờ tự xoay theo màu của bạn, thanh lợi thế, biểu đồ lợi thế (bấm để nhảy tới nước), bảng nước đi có icon theo loại, mũi tên nước tốt nhất kèm giải thích và biến chính, độ chính xác (accuracy) hai bên, bảng đếm loại nước, nút **Nước sai tiếp theo**.
- Phím tắt: `←` `→` tua từng nước, `Home` / `End` về đầu / cuối ván.
- **Đấu với máy có huấn luyện viên**: chọn 1 trong 7 mức (Người mới ~500 → Tối đa), cầm Trắng / Đen / ngẫu nhiên. Sau mỗi nước, huấn luyện viên chấm điểm và giải thích (vd. "Ba6 để mất Tượng ở a6: đối thủ có thể đi Nxa6. Nước tốt hơn là d4"), nhắc khi máy vừa đi sai, có **Gợi ý** (lần 1 chỉ quân, lần 2 hiện nước) và **Đi lại**. Ván đang chơi được lưu, tải lại trang vẫn chơi tiếp được; hết ván bấm **Xem lại cả ván** để mở màn hình review ngay.

- **Tự luyện tập**: tự đi cả hai màu; Stockfish (sức mạnh tối đa, phân tích nhanh ở độ sâu 12 rồi sâu dần tới 22) gợi ý quân nào nên đi tới ô nào bằng mũi tên + 1 dòng chữ — chỉ là gợi ý, bạn đi nước khác tùy ý. Mỗi nước được chấm theo cùng tiêu chí với phần Review ("lẽ ra nên đi …"). Lùi/tiến nước, đi nhánh mới, bật/tắt gợi ý, nhập FEN/PGN để tập từ thế cờ bất kỳ; tiến độ được lưu trên máy.

### Các mức của máy

Chỉnh trong [`src/play/levels.ts`](src/play/levels.ts). Stockfish chỉ hỗ trợ giới hạn Elo (`UCI_Elo`) từ 1320 trở lên, nên mức **Khá / Mạnh / Kiện tướng** dùng tính năng đó, còn **Người mới / Cơ bản / Trung bình** được làm yếu bằng cách tính nông, chọn ngẫu nhiên có trọng số trong vài nước tốt nhất và thỉnh thoảng đi một nước bất kỳ — Elo của các mức này là ước lượng. Máy đối thủ chạy trong một engine 1 luồng riêng; huấn luyện viên dùng engine phân tích chính (độ sâu 14).
- Giao diện tối, dùng tốt trên điện thoại.

## Chạy trên máy

Cần Node.js 20 trở lên.

```bash
npm install        # tự copy file Stockfish vào public/engine (script postinstall)
npm run dev        # mở http://localhost:5173
```

Các lệnh khác:

| Lệnh | Tác dụng |
| --- | --- |
| `npm test` | Chạy unit test (Vitest) cho thuật toán phân loại |
| `npm run build` | Kiểm tra kiểu (TypeScript) và build bản production vào `dist/` |
| `npm run preview` | Chạy thử bản build (có sẵn header COOP/COEP) |
| `npm run eco` | Tạo lại `src/data/eco.json` từ dữ liệu khai cuộc của lichess |

## Cách phân loại nước đi

Mã nằm trong `src/analysis/`, **mọi ngưỡng nằm trong [`src/analysis/config.ts`](src/analysis/config.ts)**: chỉnh ở đó rồi tải lại trang là xong. Kết quả engine được cache dưới dạng điểm thô, nên đổi ngưỡng không cần phân tích lại.

- Điểm engine → xác suất thắng theo góc nhìn người đi: `Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`, mate coi như ±10000cp.
- Expected points `EP = Win% / 100`. **Độ mất** = EP(nước tốt nhất) − EP(nước đã đi).
- **Tốt nhất** (trùng nước engine) · **Rất tốt** ≤ 0.02 · **Tốt** ≤ 0.05 · **Thiếu chính xác** ≤ 0.10 · **Sai lầm** ≤ 0.20 · **Sai nghiêm trọng** > 0.20.
- **Khai cuộc**: thế cờ nằm trong dữ liệu ECO (và mọi nước trước đó cũng vậy).
- **Tuyệt diệu** (Brilliant): nước tốt nhất / gần tốt nhất, có thí quân (đo bằng Static Exchange Evaluation trên nước đi hợp lệ thật), EP trước nước đi trong khoảng 0.2–0.9.
- **Nước hay** (Great): nước tốt thứ 2 kém hơn > 0.10 EP (không tính nước ăn lại quân hiển nhiên).
- **Bỏ lỡ** (Miss): đối thủ vừa mắc Sai lầm / Sai nghiêm trọng, nước của mình mất ≥ 0.10 nhưng không làm thế cờ tệ hơn trước lỗi của đối thủ.
- **Accuracy mỗi nước** = `103.1668 * exp(-0.04354 * độMấtWin%) - 3.1669`, kẹp [0, 100]. **Accuracy cả ván** = trung bình của (trung bình có trọng số theo độ biến động) và (trung bình điều hòa), giống cách của Lichess. Đổi `accuracy.method` thành `'mean'` để dùng trung bình cộng.

## Cấu trúc thư mục

```
public/engine/        Stockfish WASM (tự copy khi npm install, không commit)
scripts/              copy-engine.mjs, build-eco.mjs
src/api/              Gọi API chess.com
src/engine/           Bọc Stockfish qua Web Worker (UCI), pipeline phân tích
src/analysis/         config, winProb, classify, material (thí quân), accuracy, openings, review
src/analysis/__tests__ Unit test Vitest
src/storage/          IndexedDB cache, localStorage
src/components/       Giao diện trang chủ và màn hình review
vercel.json           Header COOP/COEP cho Vercel
```

## Stockfish đa luồng và header COOP/COEP

Bản Stockfish đa luồng cần `SharedArrayBuffer`, tức là trang phải **cross-origin isolated** nhờ hai header:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Hai header này đã được cấu hình cho `npm run dev` / `npm run preview` (trong `vite.config.ts`) và cho Vercel (trong `vercel.json`). Nếu trình duyệt không hỗ trợ (hoặc host không gửi header), app **tự chuyển sang bản 1 luồng**. Góc phải thanh trên cùng cho biết engine đang chạy mấy luồng.

Lưu ý: với COEP `require-corp`, trang không nhúng được ảnh từ domain khác (vd. avatar chess.com), nên avatar được thay bằng chữ cái đầu. API chess.com vẫn gọi được vì có CORS.

## Deploy lên Vercel

**Cách 1 — qua GitHub (khuyên dùng):** push repo lên GitHub → vào [vercel.com/new](https://vercel.com/new) → Import repo. Vercel tự nhận Vite (build `npm run build`, output `dist`). Mỗi lần push lên nhánh chính sẽ tự deploy lại.

**Cách 2 — bằng Vercel CLI:**

```bash
npx vercel login
npx vercel          # deploy bản preview, trả về URL thử
npx vercel --prod   # deploy bản chính thức
```

Sau khi deploy, mở trang và kiểm tra góc phải: thấy "Stockfish 19 · N luồng" (N > 1) là header COOP/COEP đã hoạt động.

## Credit và giấy phép

- **Stockfish** — engine cờ vua mã nguồn mở, giấy phép **GPL-3.0**. Bản WebAssembly lấy từ [stockfish.js](https://github.com/nmrugg/stockfish.js) của Nathan Rugg (gói npm `stockfish`). File engine được phục vụ nguyên vẹn, kèm giấy phép tại `/engine/STOCKFISH-LICENSE.txt`. Mã nguồn Stockfish: <https://github.com/official-stockfish/Stockfish>.
- **chess.com Published-Data API** — dữ liệu ván cờ công khai: <https://www.chess.com/news/view/published-data-api>. Cờ Review là dự án độc lập, không liên kết hay được chess.com bảo trợ.
- **lichess-org/chess-openings** — tên khai cuộc ECO, giấy phép CC0: <https://github.com/lichess-org/chess-openings>.
- Công thức Win% và accuracy tham khảo cách tính công khai của [Lichess](https://lichess.org/page/accuracy).
- Thư viện: [chess.js](https://github.com/jhlywa/chess.js) (BSD-2), [react-chessboard](https://github.com/Clariity/react-chessboard) (MIT), [idb](https://github.com/jakearchibald/idb) (ISC).
