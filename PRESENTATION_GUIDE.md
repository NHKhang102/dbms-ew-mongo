# Hướng dẫn demo MongoDB (EW)

**Chủ đề:** Các kỹ thuật QP&O khác + QP&O trong HQTCSDL ngày nay
**Phần của bạn:** demo live phía MongoDB, gồm 3 mạch ở A.3 (slide 15 giới thiệu, slide 17 chạy live, tổng ~2,5 phút)
**Số liệu:** lấy từ lần chạy thật trên Atlas M0, MongoDB 8.0.34, ngày 14/10/2026. Toàn bộ output nằm trong `results/`.

---

## 1. Thông điệp của demo

> **Lý thuyết Chương 3 đang chạy thật bên trong MongoDB.** Cùng một câu truy vấn đổi từ chậm sang nhanh khi có index, MongoDB tự chọn thuật toán join, và optimizer tự đẩy phép chọn xuống dưới phép nối.

| Mạch | Chương 3 | Trước | Sau |
|---|---|---|---|
| 1 · SELECT | S1 → S6/S8 | COLLSCAN đọc **48.345** document để trả 30 | IXSCAN đọc đúng **30** |
| 2 · JOIN | J1 → J2 (→ J4) | NestedLoopJoin đọc **~484.000** document | IndexedLoopJoin đọc **~1.300** |
| 3 · Heuristic | Luật #6 (đẩy σ xuống dưới ⋈) | `$match` viết sau `$lookup` | Plan **giống hệt** khi viết `$match` trước (✔ SAME PLAN) |

---

## 2. Chuẩn bị

### Hôm trước

- [ ] `./run.sh check_data`: mọi dòng có ✔.
- [ ] `./run.sh live`: tạo `results/demo1_selection.txt`, `demo2_join.txt`, `demo3_pushdown.txt` làm **phương án dự phòng**. Chụp màn hình các bước chính để chèn vào slide 17.
- [ ] Tập kịch bản mục 4 ít nhất 2 lần, bấm giờ (mục tiêu ≤ 2 phút).

### 30 phút trước khi lên

- [ ] **Atlas → Network Access: thêm IP của mạng tại phòng thi.** IP đổi theo mạng; đây là lỗi hay gặp nhất. Nếu không chắc, tạm thêm `0.0.0.0/0` rồi xoá sau buổi thuyết trình.
- [ ] `./run.sh check_data`: kết nối được, dữ liệu đủ.
- [ ] Báo nhóm: **không ai chạy demo trên cluster này** trong lúc thuyết trình (demo tạo/xoá index).

### Ngay trước khi tới lượt

- [ ] `./run.sh cleanup`: xoá mọi index để Mạch 1 bắt đầu từ trạng thái "chưa có index".
- [ ] `./run.sh shell`: mở shell, để sẵn ở dấu nhắc `mri_demo>`.
- [ ] Phóng to chữ terminal VS Code (`Ctrl` + `=`), thu nhỏ sidebar, đóng các panel khác.
- [ ] Mở file này ở mục 4 để copy từng lệnh.

---

## 3. Giới thiệu demo — slide 15 (30 giây)

> "Dữ liệu là đúng hai tập Mendeley bắt buộc, đã nạp lên MongoDB Atlas: 575 ghi chú của bác sĩ X-quang (collection `report`) và header của 48.345 lát ảnh MRI cột sống thắt lưng (collection `mri_image`). Hai collection nối với nhau qua `patient_id`. Nhóm chạy 3 mạch giống phía PostgreSQL: SELECT có và không có index, JOIN, và tối ưu heuristic."

---

## 4. Kịch bản demo live — slide 17 (2 phút)

Mọi lệnh gõ trong `./run.sh shell`. Đó là mongosh thật, kết nối Atlas, có sẵn helper `show(...)` để in explain gọn.
**Mẹo:** copy-paste từng lệnh, đừng gõ tay. Chỉ chuột vào đúng dòng output khi nói.

### Câu mở (5 giây)

> "Bây giờ nhóm chạy đúng 3 mạch vừa làm trên PostgreSQL, nhưng trên MongoDB Atlas, cùng dữ liệu MRI."

### Mạch 1 — SELECT: S1 → S6/S8 (~40 giây)

```js
show(db.mri_image, { patient_id: 1, modality: "T2" })
```

👉 Chỉ vào: `Plan: COLLSCAN` và `Result: 30 returned · … 48,345 documents examined`

> "Chưa có index, MongoDB chỉ có một cách: **COLLSCAN**, chính là **S1 linear search**. Nó đọc toàn bộ 48.345 lát ảnh để lấy ra 30."

```js
db.mri_image.createIndex({ patient_id: 1, modality: 1 })
show(db.mri_image, { patient_id: 1, modality: "T2" })
```

👉 Chỉ vào: `IXSCAN … bounds: patient_id [1, 1] · modality ["T2", "T2"]` và `30 documents examined`

> "Thêm một index B+-tree ghép, plan đổi thành **IXSCAN**, tức **S6/S8**. Hai điều kiện trở thành khoảng tìm trên index, nên chỉ đọc đúng 30 document. Số document đọc cho mỗi kết quả giảm từ hơn 1.600 xuống 1."

### Mạch 2 — JOIN: J1 → J2 (→ J4) (~45 giây)

```js
db.mri_image.dropIndexes()
show(db.report, [ { $match: { patient_id: { $lte: 10 } } }, lookupImages, { $match: { "images.modality": "T2" } } ])
```

👉 Chỉ vào: `Join: NestedLoopJoin = Chapter 3 J1` và `~484,025 documents examined`

> "Đây là pipeline join ở A.3: report nối với ảnh MRI qua `$lookup`. Chưa có index trên cột join, MongoDB dùng **nested-loop join, J1**: mỗi report quét lại toàn bộ ảnh. Mới 10 report mà đã đọc gần nửa triệu document."

```js
db.mri_image.createIndex({ patient_id: 1 })
show(db.report, [ { $match: { patient_id: { $lte: 10 } } }, lookupImages, { $match: { "images.modality": "T2" } } ])
```

👉 Chỉ vào: `Join: IndexedLoopJoin = Chapter 3 J2` và `~1,309 documents examined`

> "Thêm index trên cột join, cùng câu truy vấn chuyển sang **J2 single-loop**: mỗi report chỉ dò index một lần. Từ gần 500 nghìn xuống khoảng 1.300 document."

**Nếu còn thời gian (+15 giây):**

```js
show(db.mri_image, [ { $match: { modality: "T2", instance_number: 1 } }, lookupReport ], { allowDiskUse: true })
```

👉 Chỉ vào: `Join: HashJoin = Chapter 3 J4`

> "Khi bảng bên trong nhỏ và không có index, MongoDB 8.0 dùng **hash join, J4**. Nhưng MongoDB **không có J3 sort-merge join**."

### Mạch 3 — Heuristic: đẩy σ xuống dưới join (~35 giây)

```js
show(db.mri_image, [ lookupReport, { $match: { modality: "T2", instance_number: 1 } } ])
show(db.mri_image, [ { $match: { modality: "T2", instance_number: 1 } }, lookupReport ])
compareLast()
```

👉 Chỉ vào: `As written: $lookup → $match`, dòng `Pushed down: …`, rồi `Plan check: ✔ SAME PLAN`

> "Cùng câu hỏi, viết hai kiểu. Cách đầu viết 'xấu': join trước rồi mới lọc. Nhìn dòng **Pushed down**: optimizer đã tự kéo điều kiện lọc xuống trước join. So hai plan: **giống hệt nhau**. Đây là **luật biến đổi số 6 của Chương 3**, đẩy phép chọn xuống dưới phép nối. PostgreSQL làm điều này với WHERE, MongoDB làm với aggregation pipeline."

### Câu chốt (10 giây)

> "Cả ba mạch cho thấy lý thuyết Chương 3 đang chạy thật trong MongoDB: từ S1 sang S8, từ J1 sang J2 và J4, và luật đẩy phép chọn xuống. Khác biệt với PostgreSQL: MongoDB không có sort-merge join, và nó chọn plan bằng cách chạy thử thay vì ước lượng chi phí."

---

## 5. Cách đọc output (khi bị hỏi "dòng này là gì?")

| Dòng | Nghĩa |
|---|---|
| `Query` | Câu lệnh MongoDB đúng như gửi lên server (`lookupImages`/`lookupReport` được in đầy đủ) |
| `Engine` | `classic` hay `SBE` (slot-based engine, engine mới), và có bao nhiêu plan ứng viên chạy đua |
| `Plan` | Cây plan. Đọc từ **dưới lên**: stage dưới cùng chạy trước. `bounds` là khoảng tìm trên index |
| `Pushed down` | Điều kiện lọc đã được đẩy xuống tận bước scan |
| `As written` → `Runs as` | Thứ tự stage người viết → thứ tự thực thi sau khi optimizer viết lại |
| `Join` | Thuật toán join MongoDB báo, kèm tên Chương 3 (J1/J2/J4) |
| `Result` | Số kết quả, số index key và document đã đọc. **documents examined per result** chính là "selectivity thực tế" |

`show(...)` chỉ là hàm nhỏ nhóm viết để in gọn kết quả `explain("executionStats")` chuẩn của MongoDB. Nếu bị hỏi, chứng minh bằng lệnh gốc:

```js
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats").executionStats.totalDocsExamined
```

---

## 6. Sự cố & cách xử lý

| Sự cố | Xử lý nhanh |
|---|---|
| `Could not connect to Atlas` / timeout | Atlas → Network Access → thêm IP hiện tại hoặc `0.0.0.0/0`, chờ ~30 giây rồi chạy lại |
| Mạng chết hẳn | Chuyển sang ảnh chụp trong slide 17, hoặc mở `results/demo1_selection.txt`, `demo2_join.txt`, `demo3_pushdown.txt` và đọc theo kịch bản |
| Mạch 1 ra IXSCAN ngay lần đầu | Có index sót lại: `db.mri_image.dropIndexes()` rồi chạy lại |
| Mạch 2 bước đầu ra IndexedLoopJoin | Index `patient_id` còn tồn tại: `db.mri_image.dropIndexes()` rồi chạy lại |
| Số liệu lệch vài phần trăm so với file này | Bình thường (thời gian server dao động). Số document/key đã đọc thì phải giống |
| Hết giờ | Bỏ bước HashJoin; Mạch 3 chỉ cần `compareLast()` và câu chốt |

---

## 7. Hỏi đáp dự kiến về demo

**Q: `show()` là gì? Có phải output tự chế không?**
A: Đó là hàm nhỏ nhóm viết, gọi `explain("executionStats")` chuẩn của MongoDB rồi in gọn các trường quan trọng. Chạy lệnh gốc ở mục 5 sẽ ra cùng con số.

**Q: Mạch 1: vì sao có index thì chỉ đọc 30 document?**
A: Index B+-tree ghép `{patient_id, modality}` biến hai điều kiện bằng thành một khoảng tìm `[1,1] × ["T2","T2"]`. Server chỉ duyệt 30 key khớp rồi lấy đúng 30 document.

**Q: Mạch 2: con số ~484.000 document từ đâu ra?**
A: 10 report × 48.345 lát ảnh, cộng với lượt quét bảng report bên ngoài (575). Đúng công thức chi phí của nested-loop join: mỗi bản ghi ngoài quét lại toàn bộ bảng trong.

**Q: Vì sao Mạch 2 chỉ lấy 10 report?**
A: Join không index trên cả 575 report sẽ đọc khoảng 28 triệu document và mất nhiều giây. 10 report là đủ thấy quy luật. Bản đầy đủ chạy bằng `FULL_NLJ=1 ./run.sh demo2`.

**Q: Khi nào MongoDB dùng hash join?**
A: Khi không có index dùng được trên field join của collection bên trong, collection đó nhỏ (≤ 10.000 document và ≤ 100 MB), và cho phép dùng đĩa (`allowDiskUse`). Thiếu một điều kiện thì quay về nested loop.

**Q: MongoDB có sort-merge join (J3) không?**
A: Không. `$lookup` chỉ có NestedLoopJoin, IndexedLoopJoin và HashJoin.

**Q: MongoDB chọn thuật toán join và plan như thế nào?**
A: Theo luật (có index không, bảng bên trong có nhỏ không, có cho dùng đĩa không), và khi có nhiều index ứng viên thì cho các plan chạy thử rồi chọn plan hiệu quả nhất. Nó không ước lượng chi phí từ thống kê như PostgreSQL.

**Q: Mạch 3: optimizer biết được đẩy `$match` xuống khi nào?**
A: Khi `$match` không dùng field do `$lookup` tạo ra (ở đây là `rep`). Điều kiện `modality`, `instance_number` thuộc document gốc, nên đưa lên trước join không đổi kết quả. Nếu lọc trên `rep.…` thì không đẩy được.

**Q: SBE là gì?**
A: Slot-Based Execution engine, engine thực thi mới của MongoDB. Trong 8.0, các pipeline có `$lookup` được đẩy xuống SBE (dòng `Engine` trong output của Mạch 2 và 3); `find()` đơn giản ở Mạch 1 vẫn chạy classic engine.

**Q: Đề xuất ghi `patient_id = 'P0123'`, sao demo dùng số?**
A: Trong dữ liệu Mendeley thật, `patient_id` là số (1–575). `modality` nằm ở collection ảnh, không nằm ở `report`, nên Mạch 1 chạy trên `mri_image`.

**Q: Dữ liệu có phải dữ liệu thật không?**
A: Đúng hai tập Mendeley bắt buộc: 575 ghi chú (s6bgczr8s2) và header của 48.345 lát DICOM (k57fr854j2). `./run.sh check_data` kiểm tra điều này.

---

## 8. Phụ lục — toàn bộ lệnh live (copy một lần)

Chạy trước: `./run.sh cleanup`, rồi `./run.sh shell`.

```js
// Mạch 1 — S1 → S6/S8
show(db.mri_image, { patient_id: 1, modality: "T2" })
db.mri_image.createIndex({ patient_id: 1, modality: 1 })
show(db.mri_image, { patient_id: 1, modality: "T2" })

// Mạch 2 — J1 → J2 (→ J4)
db.mri_image.dropIndexes()
show(db.report, [ { $match: { patient_id: { $lte: 10 } } }, lookupImages, { $match: { "images.modality": "T2" } } ])
db.mri_image.createIndex({ patient_id: 1 })
show(db.report, [ { $match: { patient_id: { $lte: 10 } } }, lookupImages, { $match: { "images.modality": "T2" } } ])
show(db.mri_image, [ { $match: { modality: "T2", instance_number: 1 } }, lookupReport ], { allowDiskUse: true })   // tuỳ chọn: HashJoin

// Mạch 3 — đẩy σ xuống dưới ⋈
show(db.mri_image, [ lookupReport, { $match: { modality: "T2", instance_number: 1 } } ])
show(db.mri_image, [ { $match: { modality: "T2", instance_number: 1 } }, lookupReport ])
compareLast()
```

Kết quả kỳ vọng (đã chạy thử từ trạng thái sạch):

| Lệnh | Plan / Join | Documents examined |
|---|---|---|
| Mạch 1, lần 1 | COLLSCAN | 48.345 (trả 30) |
| Mạch 1, lần 2 | IXSCAN → FETCH | 30 |
| Mạch 2, lần 1 | NestedLoopJoin (J1) | ~484.025 |
| Mạch 2, lần 2 | IndexedLoopJoin (J2) | ~1.309 |
| HashJoin (tuỳ chọn) | HashJoin (J4) | 48.920 |
| Mạch 3 | hai plan giống nhau | ✔ SAME PLAN |

Sau buổi thuyết trình: `./run.sh cleanup` và xoá `0.0.0.0/0` khỏi Network Access nếu đã thêm.
