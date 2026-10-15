# Demo MongoDB 100% trên Atlas Website / Compass — hướng dẫn thay thế VS Code

> Không xoá flow VS Code hiện tại. Đây là phương án B khi bạn muốn demo
> hoàn toàn trên giao diện Atlas (browser) hoặc Compass (desktop), không mở VS Code.
> Mọi query trong file này đều là `mongosh` thuần — chạy được trong
> **Atlas Shell** (nút `Shell` trên Atlas website) và **Compass Shell** (panel `>_ Open MongoDB shell` dưới cùng).

File lệnh copy-paste: [`demos/atlas_compass_queries.js`](demos/atlas_compass_queries.js) — chỉ việc mở, Ctrl+A, copy từng khối.

---

## 1. Trả lời nhanh: có làm được không? Có dễ show không?

**Có, làm được toàn bộ.** Và dễ show nếu bạn chấp nhận một điểm:

| Cách | Kết nối | Output đẹp như `show()` của VS Code? | Ghi chú |
|---|---|---|---|
| **VS Code `./run.sh shell`** (hiện tại) | `mongosh` qua `npx`, helper `show()` / `compareLast()` in gọn | ✔ Đẹp nhất — đã format sẵn `Plan`, `Result`, `Join` | Cần Node.js + `.env` |
| **Atlas Website** (browser) | Nút `Connect → Shell` (mongosh trong browser) hoặc `Data Explorer` | ◑ Đẹp nếu dùng Shell, xấu nếu chỉ click UI | Shell = mongosh thật, chạy được mọi `explain()` |
| **Compass** (desktop) | Dán connection string Atlas | ◑ Đẹp nếu dùng Shell, rất trực quan nếu dùng tab `Explain` / `Aggregations` | Tab `Documents → Explain → Visual Tree` cực hợp để chiếu |

**Kết luận:**

* Chỉ click thuần trên **Data Explorer / Compass Documents** (không mở Shell) → chỉ demo được **Mạch 1 (find)** dạng visual, không đủ cho Mạch 2/3 (`$lookup`, `allowDiskUse`, `hint`, `allPlansExecution`). Thiếu.
* Mở **Shell trong Atlas / Compass** + copy query thuần → demo được **100%**, y hệt VS Code, chỉ khác là output là JSON `explain()` gốc (dài ~100 dòng) thay vì bản gọn của `show()`. Bạn chỉ cần chỉ đúng 3 field: `winningPlan.stage`, `totalDocsExamined`, `totalKeysExamined`.

Vì vậy hướng dẫn dưới đây dùng **Shell làm chính, UI làm phụ** (UI để cho hội đồng thấy Visual Tree cho ấn tượng).

---

## 2. Chuẩn bị chung (giống hệt README)

1. Atlas → **Network Access** → thêm IP phòng thi (hoặc `0.0.0.0/0` tạm).
2. Lấy connection string: Atlas → `Connect → Drivers` (dạng `mongodb+srv://.../mri_demo`).
3. Kiểm tra data (chạy ở bất kỳ shell nào):
   ```js
   use mri_demo
   db.report.countDocuments()     // 575
   db.mri_image.countDocuments()  // 48345
   ```

> Không cần `.env`, không cần `run.sh`, không cần cài Node.js cho phương án này.

---

## 3. Cách mở Shell

### A. Atlas Website

1. Atlas → `Database` → cluster → `Browse Collections`.
2. Góc phải có nút **`Shell`** (hoặc `Connect → Connect with MongoDB Shell`). Bấm → mở tab shell đã connect sẵn `mri_demo`.
3. Nếu không thấy nút Shell (tùy tier), bấm `Connect → Compass` để lấy URI rồi mở Compass.

### B. Compass

1. Mở Compass → dán URI Atlas → `Connect`.
2. Chọn database `mri_demo`.
3. Dưới cùng bấm **`>_ Open MongoDB shell`** (hoặc `Ctrl+` `` ` ``). Đây là mongosh thật.
4. Các tab hữu ích khi chiếu:
   * **Documents** → ô `Filter` → nút **`Explain`** → chọn `Visual Tree` (Mạch 1).
   * **Aggregations** → dán pipeline → nút **`Explain`** (Mạch 2/3).
   * **Indexes** → `Create Index` / `Drop Index` (thay cho `createIndex`/`dropIndexes` bằng lệnh).

> Mẹo chiếu: phóng to Compass (`View → Zoom In`), kéo Shell lên nửa màn hình.

---

## 4. File lệnh dùng cho Shell (Atlas / Compass)

Mở [`demos/atlas_compass_queries.js`](demos/atlas_compass_queries.js) — mỗi khối là một bước demo, đã ghi sẵn comment `// → nhìn gì`.

**Cách dùng:**

* **Cách 1 (khuyên dùng khi live):** mở file trên laptop, copy từng khối 3–5 dòng, dán vào Shell Atlas/Compass, Enter. Đừng dán cả file một lần.
* **Cách 2:** nếu Shell hỗ trợ `load()`, có thể `load("/đường/dẫn/atlas_compass_queries.js")` — nhưng Atlas browser shell thường không có file system, nên Cách 1 an toàn hơn.
* **Trước khi demo live:** chạy khối `// RESET` để xoá index (`db.mri_image.dropIndexes(); db.report.dropIndexes()`), giống `./run.sh cleanup`.

Các query trong file là **mongosh thuần**, không phụ thuộc `lib/common.js`, ví dụ:

```js
// Mạch 1 — chưa index
db.mri_image.dropIndexes()
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats")

// Mạch 1 — có index
db.mri_image.createIndex({ patient_id: 1, modality: 1 })
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats")
// → winningPlan: FETCH <- IXSCAN, bounds: patient_id [1,1] x modality ["T2","T2"], totalDocsExamined: 30
```

Toàn bộ Mạch 1/2/3 + 4 demo bổ trợ + 2 extra đều có trong file, mỗi khối ghi rõ **nhìn field nào**.

---

## 5. Kịch bản live 2 phút trên Atlas/Compass Shell (bản rút gọn)

> Chuẩn bị trước: chạy `db.mri_image.dropIndexes(); db.report.dropIndexes()` trong Shell.

**Câu mở (5s):** “Bây giờ chạy đúng 3 mạch vừa làm trên PostgreSQL, nhưng trên MongoDB Atlas, cùng dữ liệu MRI.”

**Mạch 1 — S1 → S6/S8 (40s)**

```js
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats")
```
Chỉ vào `winningPlan.stage: "COLLSCAN"` và `executionStats.totalDocsExamined: 48345`, `nReturned: 30`.

```js
db.mri_image.createIndex({ patient_id: 1, modality: 1 })
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats")
```
Chỉ vào `IXSCAN` với `indexBounds: patient_id [1,1], modality ["T2","T2"]` và `totalDocsExamined: 30`.

> Nói: “COLLSCAN là S1 linear search, IXSCAN là S6/S8 B+-tree.”

**Mạch 2 — J1 → J2 (45s)**

```js
// 2a. Chưa có index trên mri_image.patient_id -> NestedLoopJoin (J1)
db.mri_image.dropIndexes()
db.report.explain("executionStats").aggregate([
  { $match: { patient_id: { $lte: 10 } } },
  { $lookup: { from: "mri_image", localField: "patient_id", foreignField: "patient_id", as: "images" } },
  { $match: { "images.modality": "T2" } }
])
// Compass Aggregations: dán pipeline trên, bấm Explain
```
Chỉ vào:
* `winningPlan.queryPlan.strategy`: `"NestedLoopJoin"` (J1).
* `executionStats.totalDocsExamined`: **484,025** (Outer `report` COLLSCAN 575 docs + Inner `mri_image` quét 10 lần $\times$ 48,345 docs = 483,450 docs).
* `collectionScans`: **11** (1 scan outer + 10 full scan bảng inner).
* `totalKeysExamined`: **0** (hoàn toàn không dùng index).

```js
db.mri_image.createIndex({ patient_id: 1 })
db.report.aggregate([
  { $match: { patient_id: { $lte: 10 } } },
  { $lookup: { from: "mri_image", localField: "patient_id", foreignField: "patient_id", as: "images" } },
  { $match: { "images.modality": "T2" } }
]).explain("executionStats")
```
Chỉ vào:
* `winningPlan.queryPlan.strategy`: `"IndexedLoopJoin"` (J2).
* `executionStats.totalDocsExamined`: **1,309** (575 outer + 734 inner — quét inner giảm **658 lần** so với 483,450 ở 2a).
* `executionStats.totalKeysExamined`: **734**.
* `indexSeeks`: **10** (10 lần tra B-tree cho 10 bệnh nhân).
* `executionTimeMillis`: **~4 ms** (nhanh hơn ~50 lần).

> Nếu còn 15s: `db.mri_image.aggregate([{ $match: { modality: "T2", instance_number: 1 } }, { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } }], { allowDiskUse: true }).explain("executionStats")` → `HashJoin` (J4).

**Mạch 3 — Đẩy σ xuống (35s)**

```js
db.mri_image.createIndex({ modality: 1, patient_id: 1, instance_number: 1 })
db.mri_image.aggregate([
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } },
  { $match: { modality: "T2", instance_number: 1 } }
]).explain("executionStats")

db.mri_image.aggregate([
  { $match: { modality: "T2", instance_number: 1 } },
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } }
]).explain("executionStats")
```
Chỉ vào hai output có `queryPlanner.winningPlan` giống hệt nhau, `executionStats.totalDocsExamined` bằng nhau → optimizer đã tự đẩy `$match` lên trước `$lookup` (luật #6).

**Câu chốt (10s):** “Cùng Chương 3: S1→S8, J1→J2/J4, luật đẩy phép chọn xuống — MongoDB làm tự động.”

---

## 6. Cách đọc output thuần (không có `show()`)

`show()` trong VS Code chỉ là bản in gọn của `explain("executionStats")`. Trên Atlas/Compass Shell bạn đọc JSON gốc như sau:

| Muốn biết gì | Vào field nào (JSON) |
|---|---|
| Plan là COLLSCAN hay IXSCAN | `queryPlanner.winningPlan.stage` hoặc `winningPlan.inputStage.stage` |
| Có SORT không | Tìm `stage: "SORT"` trong `winningPlan` |
| Index nào được dùng, bounds | `winningPlan.inputStage.indexName` + `indexBounds` |
| Filter bị đẩy xuống chưa | `queryPlanner.parsedQuery` (nếu có) = filter đã đẩy vào scan |
| Join J1/J2/J4 | `executionStats.executionStages.strategy` hoặc `stages[0].$lookup.strategy` — giá trị `NestedLoopJoin` / `IndexedLoopJoin` / `HashJoin` |
| Số document đọc / trả về | `executionStats.totalDocsExamined` / `totalKeysExamined` / `nReturned` — tỉ lệ `docs/nReturned` chính là selectivity thực tế |
| Thời gian server | `executionStats.executionTimeMillis` |
| SBE hay classic | `explainVersion: "2"` = SBE, `"1"` = classic |
| Candidate plan đua | `queryPlanner.rejectedPlans.length` + `executionStats.allPlansExecution` (khi chạy `explain("allPlansExecution")`) |

**Mẹo:** trong Shell gõ `.explain("executionStats").executionStats.totalDocsExamined` để chỉ in con số, đỡ phải lướt JSON dài.

---

## 7. Ánh xạ từng demo hiện tại sang Atlas/Compass

| File hiện tại (`demos/`) | Demo bằng Atlas/Compass thế nào | Cần Shell? |
|---|---|---|
| `check_data` | Chạy khối `CHECK` trong `atlas_compass_queries.js` hoặc gõ `countDocuments()` trực tiếp trong Shell | Shell |
| `demo1_selection` | **UI được:** Documents → Filter `{patient_id:1, modality:"T2"}` → Explain (Visual Tree) cho COLLSCAN/IXSCAN. **Shell:** `find().explain()` như mục 5 | UI + Shell |
| `demo2_join` | **UI:** Aggregations → dán 3 stage → Explain (thấy Nested vs Indexed). **Shell:** `aggregate().explain()` để thấy `strategy` rõ hơn | Shell khuyên dùng |
| `demo3_pushdown` | So 2 pipeline trong Aggregations hoặc 2 lần `aggregate().explain()` trong Shell, so `winningPlan` | Shell |
| `compound_index` | Cần `hint` để ép từng index ESR — chỉ Shell làm được (`find().hint("idx_RES").explain()`) | Shell |
| `plan_cache` | `explain("allPlansExecution")` + so `planCacheShapeHash` — chỉ Shell | Shell |
| `pipeline_rewrite` | Aggregations Explain sẽ hiện `Runs as` dạng pipeline rewrite | UI + Shell |
| `sort_memory` | `allowDiskUse:true` và xem `usedDisk` / `totalDataSizeSortedBytesEstimate` — chỉ Shell (`explain` mới thấy spill 93MB, chạy thật trên M0 vẫn báo lỗi) | Shell |
| `extra_text_search` | Compass → Indexes → tạo `text` index, hoặc `createIndex({clinician_notes:"text"})` trong Shell | UI được |
| `extra_sbe_engine` | Chỉ Shell (`explainVersion` + `setQuerySettings` — M0 sẽ báo lỗi expected) | Shell |

---

## 8. Hạn chế đã biết trên Atlas M0 (giống hệt khi dùng VS Code)

Giữ nguyên như `README.md:90` — không phải do đổi sang Atlas/Compass:

* `getPlanCache().list()` và `setQuerySettings` → `AtlasError` / `CommandNotFound` (M0 free tier chặn). Đây là minh chứng cho slide, đã có `Note` trong output.
* `sort` với `allowDiskUse:true` → `explain` báo `spilled to disk` (93MB) nhưng chạy thật `.aggregate().next()` trên M0 vẫn lỗi `QueryExceededMemoryLimitNoDiskUseAllowed` — M0 bỏ qua `allowDiskUse` khi thực thi.
* HashJoin chỉ ra khi `allowDiskUse:true` + không có index + foreign ≤10k docs (report 575 thỏa).

---

## 9. Fallback khi mạng chết

* Atlas Website chết → mở `results/demo1_selection.txt` v.v. (đã có sẵn) hoặc ảnh chụp `SUMMARY.md`.
* Compass đã connect từ trước thì vẫn chạy offline? Không — vẫn cần mạng tới Atlas, nên chuẩn bị ảnh chụp Visual Tree cho Mạch 1 (COLLSCAN vs IXSCAN) để chèn vào slide 17.

---

## 10. Checklist trước giờ G (bản Atlas/Compass)

* [ ] Atlas Network Access đã thêm IP phòng thi.
* [ ] Compass đã `Connect` được, `mri_demo.report` = 575, `mri_image` = 48345.
* [ ] Shell Atlas/Compass đã chạy `db.mri_image.dropIndexes(); db.report.dropIndexes()` — Mạch 1 bắt đầu từ COLLSCAN.
* [ ] Đã mở sẵn `atlas_compass_queries.js` để copy, và phóng to font Shell.
* [ ] Đã chụp sẵn 3 ảnh Visual Tree / Explain để chèn nếu mạng rớt.
