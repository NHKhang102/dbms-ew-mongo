# Giải thích từng lệnh demo và output — dành cho người mới với MongoDB

> Bạn chưa quen MongoDB? Đọc file này trước khi mở `demos/atlas_compass_queries.js`.
> File kia là **lệnh chạy**, file này là **phiên dịch**: mỗi lệnh làm gì, output trả về nghĩa là gì, và khi đứng thuyết trình thì chỉ vào đâu.
>
> Liên quan: [`ATLAS_COMPASS_GUIDE.md`](ATLAS_COMPASS_GUIDE.md) (cách chạy trên Atlas/Compass) · [`README.md`](README.md) (flow VS Code).

---

## 0. Đọc thế nào cho nhanh

- Chỉ cần đọc **Mục 1 + Mục 2** là đủ để hiểu 80% buổi demo.
- **Mục 3** là tra cứu chi tiết từng khối lệnh trong `atlas_compass_queries.js` — khi nào chạy tới khối nào thì mở đúng phần đó.
- Mọi ví dụ dùng dữ liệu thật của đồ án: `mri_demo.report` (575 ghi chú bác sĩ) và `mri_demo.mri_image` (48.345 lát cắt MRI). Hai bảng nối nhau qua `patient_id`.

---

## 1. Từ điển 1 trang — MongoDB nói gì khi bạn gõ

| Từ bạn thấy | Nghĩa đời thường | Ví dụ |
|---|---|---|
| **database** `mri_demo` | Tủ hồ sơ | Chứa 2 ngăn: `report` và `mri_image` |
| **collection** `report` / `mri_image` | Ngăn tủ / bảng | `report` ≈ bảng ghi chú, `mri_image` ≈ bảng ảnh |
| **document** | Một tờ hồ sơ / một dòng | `{ patient_id: 1, modality: "T2", plane: "SAGITTAL" }` |
| **field** | Ô trên tờ hồ sơ / cột | `patient_id`, `modality`, `clinician_notes` |
| **query** | Câu hỏi bạn đưa cho tủ hồ sơ | `find({ patient_id: 1 })` = "đưa tôi hồ sơ bệnh nhân 1" |
| **index** | Mục lục cuối sách | Không có mục lục → lật từng trang. Có mục lục → tra trang ngay |
| `db` | Biến trỏ tới database đang dùng | `db.report` = collection `report` trong DB hiện tại |
| `db.getSiblingDB("mri_demo")` | "Chuyển sang tủ mri_demo" | Dùng khi Shell chưa ở đúng DB |
| `find()` | Tìm theo điều kiện (SELECT) | `find({ modality: "T2" })` ≈ `SELECT * WHERE modality='T2'` |
| `aggregate([...])` | Dây chuyền xử lý | Mỗi `{ $match / $lookup / $sort }` là một công đoạn |
| `$match` | Lọc (WHERE) | `{ $match: { modality: "T2" } }` |
| `$lookup` | Nối bảng (JOIN) | Nối `report` với `mri_image` qua `patient_id` |
| `$sort` / `$limit` / `$project` / `$unwind` / `$group` / `$addFields` | Sắp xếp / giới hạn / chọn cột / bung mảng / gom nhóm / thêm cột tính toán | Xem chi tiết ở Mục 3 |
| `explain("executionStats")` | "Giải thích mày chạy câu này thế nào, kèm thống kê" | Không chạy thật để lấy data, mà chạy để lấy **kế hoạch + số liệu** |
| `executionStats` | Thống kê thực thi | Bao nhiêu document đã đọc, bao nhiêu trả về, mất bao lâu |

**Quy ước đọc plan:** đọc từ **dưới lên**. Stage dưới cùng chạy trước. Ví dụ `FETCH ← IXSCAN` nghĩa là: quét mục lục (`IXSCAN`) trước, rồi mới mở hồ sơ (`FETCH`).

---

## 2. Output `explain()` đọc ở đâu — chỉ cần nhớ 5 con số

Khi bạn chạy `db.xxx.find(...).explain("executionStats")`, MongoDB trả về JSON dài ~100 dòng. Đừng đọc hết. Chỉ nhìn 5 chỗ này:

### 2.1. Ví dụ thu gọn (đã cắt bớt)

```js
{
  queryPlanner: {
    winningPlan: {
      stage: "FETCH",              // ← stage ngoài cùng
      inputStage: {
        stage: "IXSCAN",           // ← stage trong cùng (chạy trước)
        indexName: "pid_mod",
        indexBounds: { patient_id: ["[1, 1]"], modality: ["[\"T2\", \"T2\"]"] }
      }
    },
    rejectedPlans: []              // có bao nhiêu plan bị loại
  },
  executionStats: {
    nReturned: 30,                 // trả về bao nhiêu document
    totalKeysExamined: 30,         // đã dò bao nhiêu key trong index
    totalDocsExamined: 30,         // đã mở bao nhiêu document
    executionTimeMillis: 0         // mất bao nhiêu ms trên server
  },
  explainVersion: "1"              // "1" = classic engine, "2" = SBE (engine mới)
}
```

### 2.2. Bảng dịch nhanh

| Bạn muốn biết | Nhìn vào đâu | Tốt là bao nhiêu? |
|---|---|---|
| **Chạy kiểu gì?** | `queryPlanner.winningPlan.stage` | `COLLSCAN` = lật từng tờ (xấu), `IXSCAN` = tra mục lục (tốt) |
| **Dùng mục lục nào? Khoảng nào?** | `inputStage.indexName` + `indexBounds` | `patient_id [1,1]` nghĩa là chỉ dò đúng bệnh nhân 1 |
| **Có phải sắp xếp trong RAM không?** | Có `stage: "SORT"` không | Không có `SORT` là tốt (đã có index sắp sẵn) |
| **Đọc bao nhiêu để trả bấy nhiêu?** | `totalDocsExamined` / `nReturned` | Tỉ lệ = 1 là hoàn hảo. `48345 / 30 = 1611` là rất tệ |
| **Mất bao lâu?** | `executionTimeMillis` | So sánh 2 plan cùng câu hỏi, số nhỏ thắng |
| **Engine nào chạy?** | `explainVersion` | `"1"` = classic (find đơn giản), `"2"` = SBE (có `$lookup`/`$group`) |
| **Join kiểu gì? (J1/J2/J4)** | `executionStats.executionStages.strategy` | `NestedLoopJoin` = J1, `IndexedLoopJoin` = J2, `HashJoin` = J4 |
| **Filter được đẩy xuống chưa?** | `queryPlanner.parsedQuery` | Nếu có = optimizer đã đẩy filter vào bước scan |

### 2.3. Từ điển Stage (dòng `— ...` trong output gọn của VS Code)

| Stage | Nghĩa |
|---|---|
| `COLLSCAN` | Quét toàn bộ collection — lật từng tờ hồ sơ |
| `IXSCAN` | Quét mục lục B-tree — tra theo khoảng `indexBounds` |
| `FETCH` | Mở document thật sau khi tra mục lục |
| `EXPRESS_IXSCAN` | Đường tắt MongoDB 8.0 cho `_id` — bỏ qua cả planner |
| `SORT` | Sắp xếp chặn trong RAM (tốn bộ nhớ) |
| `LIMIT` | Dừng sau N kết quả |
| `PROJECTION_COVERED` | Trả lời chỉ từ mục lục, không mở document (0 docs examined) — giống Index-Only Scan |
| `PROJECTION_SIMPLE` | Giữ lại vài field theo `$project` |
| `EQ_LOOKUP` | Stage join `$lookup` chạy bằng SBE |
| `GROUP` / `TEXT_MATCH` | `$group` / tìm kiếm text |

### 2.4. Mẹo cho người mới

```js
// Thay vì đọc cả JSON, chỉ in con số:
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats").executionStats.totalDocsExamined
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats").executionStats.nReturned
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats").queryPlanner.winningPlan.stage
```

Trên **Compass**, tab `Documents → Filter → Explain → Visual Tree` vẽ cây plan bằng hình — rất dễ chiếu, không cần đọc JSON.

---

## 3. Giải thích chi tiết từng khối trong `atlas_compass_queries.js`

> Mỗi mục dưới tương ứng một khối comment `// === ...` trong file kia. Đọc theo thứ tự chạy.

### 3.0. Dòng đầu — chọn database

```js
db = db.getSiblingDB("mri_demo");
```
**Làm gì:** Bảo Shell "từ giờ `db` nghĩa là `mri_demo`". Nếu bạn đã `use mri_demo` rồi thì không cần.
**Output:** không có, chỉ đổi ngữ cảnh.

### 3.1. Khối `0. KIỂM TRA DATA`

```js
db.report.countDocuments()           // 575
db.mri_image.countDocuments()        // 48345
db.report.distinct("patient_id").length
db.report.countDocuments({ has_note: false })  // 60
db.mri_image.distinct("modality")    // ["T1","T2",...]
db.report.findOne({}, { _id: 0 })
```
| Lệnh | Làm gì | Output nghĩa là gì |
|---|---|---|
| `countDocuments()` | Đếm số tờ hồ sơ | Phải ra 575 và 48345 — nếu lệch là data import sai |
| `distinct("patient_id")` | Liệt kê các mã bệnh nhân khác nhau | `report` có 575, `mri_image` có 515 — 515 người có ảnh, 60 người chỉ có ghi chú |
| `countDocuments({ has_note: false })` | Đếm ghi chú rỗng | 60 là đúng theo HUONG_DAN |
| `distinct("modality")` | Các loại ảnh | Phải có `T1` và `T2` mới demo được Mạch 1 |
| `findOne({}, {_id:0})` | Xem một document mẫu | Để biết field nào có gì trước khi query |

**Khi chiếu:** chỉ cần nói "575 ghi chú, 48k lát cắt, nối qua `patient_id`".

### 3.2. Khối `RESET`

```js
db.mri_image.dropIndexes()
db.report.dropIndexes()
db.mri_image.getIndexes()
```
**Làm gì:** Xoá hết mục lục (index) để demo bắt đầu từ "chưa có index" — giống `cleanup`.
`getIndexes()` liệt kê mục lục còn lại (sau reset chỉ còn `_id_`).
**Vì sao cần:** Nếu quên reset, Mạch 1 sẽ ra `IXSCAN` ngay từ đầu, mất hiệu ứng S1→S8.

### 3.3. MẠCH 1 — SELECT (S1 → S6/S8)

**Câu hỏi chung:** "Những lát T2 của bệnh nhân 1?"

#### 1a. Chưa có index

```js
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats")
```
**Làm gì:** Tìm không có mục lục.
**Output:**
- `winningPlan.stage: "COLLSCAN"` — quét toàn bộ 48k document (S1 linear search)
- `totalDocsExamined: 48345`, `nReturned: 30` → tỉ lệ 1611: đọc 1611 tờ mới được 1 kết quả → rất tệ
- `executionTimeMillis: ~33ms`

**Nói khi chiếu:** "Chưa có index, MongoDB chỉ có một cách: lật từng tờ."

#### 1b. Có index ghép

```js
db.mri_image.createIndex({ patient_id: 1, modality: 1 })
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats")
```
**Làm gì:** Tạo mục lục ghép trên 2 cột, rồi tìm lại.
`{ patient_id: 1, modality: 1 }` nghĩa là mục lục sắp theo `patient_id` trước, `modality` sau. `1` = tăng dần.
**Output:**
- `FETCH ← IXSCAN` trên `pid_mod`
- `indexBounds: patient_id [1,1] · modality ["T2","T2"]` — chỉ dò đúng khoảng cần
- `totalDocsExamined: 30`, `totalKeysExamined: 30` → tỉ lệ 1: hoàn hảo (S6/S8)

**Nói:** "Thêm một mục lục, plan đổi thành IXSCAN — chỉ đọc đúng 30 tờ."

#### 1c. Tìm theo `_id`

```js
var anyId = db.mri_image.findOne({}, { _id: 1 })._id
db.mri_image.find({ _id: anyId }).explain("executionStats")
```
**Làm gì:** Lấy một `_id` bất kỳ rồi tìm theo nó.
**Output:** `stage: "EXPRESS_IXSCAN"` — đường tắt của MongoDB 8.0, bỏ qua cả bước lập kế hoạch.
**Ý nghĩa:** Minh hoạ S3 (primary key) — nhanh nhất.

#### 1d. Filter gần hết bảng

```js
db.mri_image.find({ patient_id: { $gte: 1 } }).explain("executionStats")
```
**Làm gì:** Tìm `patient_id >= 1` — gần như toàn bộ 48k document.
**Output:** Vẫn `IXSCAN` dù đọc hết bảng.
**Ý nghĩa:** MongoDB **không có cost model** — cứ có index là dùng, không ước lượng "quét hết thì lật từng tờ nhanh hơn". PostgreSQL thì sẽ chọn Seq Scan ở đây. Đây là điểm khác biệt để nói ở slide 12.

#### 1e. Ép quét toàn bộ bằng `hint`

```js
db.mri_image.find({ patient_id: { $gte: 1 } }).hint({ $natural: 1 }).explain("executionStats")
```
**Làm gì:** `hint({ $natural: 1 })` = "bắt buộc quét theo thứ tự đĩa, không dùng index" — ép ra `COLLSCAN` để so với 1d.
**Output:** `COLLSCAN`, `executionTimeMillis` thường **nhỏ hơn** 1d → chứng minh đáng lẽ nên quét thay vì dùng index.
**Nói:** "Cùng câu hỏi, ép quét thì lại nhanh hơn — optimizer MongoDB không tự biết."

---

### 3.4. MẠCH 2 — JOIN với `$lookup` (J1 → J2 → J4)

`$lookup` là JOIN của MongoDB. Cú pháp:
```js
{ $lookup: { from: "mri_image", localField: "patient_id", foreignField: "patient_id", as: "images" } }
```
Nghĩa là: với mỗi document bên ngoài, tìm các document bên `mri_image` có cùng `patient_id`, nhét vào mảng `images`.

#### 2a. Chưa có index → J1 NestedLoop

```js
db.report.explain("executionStats").aggregate([
  { $match: { patient_id: { $lte: 10 } } },
  { $lookup: { ... } },
  { $match: { "images.modality": "T2" } }
])
```
**Làm gì:** Lấy 10 report đầu, nối với ảnh, lọc T2.
**Vì sao chỉ 10:** Không có index, mỗi report phải quét hết 48k ảnh → 10 × 48k ≈ 484k docs. Lấy hết 575 sẽ ~28 triệu, quá chậm.
**Output:** `strategy: "NestedLoopJoin"` (J1), `totalDocsExamined ~483k`, chậm (~207ms).

#### 2b. Có index → J2 IndexedLoop

```js
db.mri_image.createIndex({ patient_id: 1 })
db.report.explain("executionStats").aggregate([ ... y hệt 2a ... ])
```
**Output:** `strategy: "IndexedLoopJoin"` (J2), `totalDocsExamined ~744`, nhanh (~3ms).
**Ý nghĩa:** Cùng câu hỏi, chỉ thêm index mà giảm từ 484k xuống 744 — minh hoạ sức mạnh index cho JOIN.

#### 2c. J2 trên toàn bộ reports

Giống 2b nhưng bỏ `$match` giới hạn 10 → `nReturned: 515`, vẫn J2.

#### 2d. HashJoin (J4) — khi inner nhỏ và cho dùng đĩa

```js
db.mri_image.explain("executionStats").aggregate([
  { $match: { modality: "T2", instance_number: 1 } },
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } }
], { allowDiskUse: true })
```
**Làm gì:** Đổi chiều join: từ `mri_image` (lớn) nối `report` (nhỏ 575 docs). Báo `allowDiskUse:true` = "được dùng đĩa nếu cần".
**Output:** `strategy: "HashJoin"` (J4) — chỉ ra khi **đồng thời**: không có index trên `report.patient_id` + `allowDiskUse:true` + bảng trong ≤10k docs.
**Ý nghĩa:** MongoDB 8.0 mới có J4. Atlas M0 ra được J4 là đã kiểm chứng ở `README`.

#### 2e. Tắt `allowDiskUse` → quay về J1

```js
// ... y hệt 2d nhưng { allowDiskUse: false }
```
**Output:** `NestedLoopJoin` lại, `docs ~847k`, chậm hơn 2d nhiều → chứng minh điều kiện để có J4.

#### 2f. Có index trên `report` → lại J2

Dù `allowDiskUse:true` nhưng có index thì MongoDB **ưu tiên J2 hơn J4** (rule cứng, không so cost).

---

### 3.5. MẠCH 3 — ĐẨY `$match` XUỐNG DƯỚI `$lookup` (luật #6)

**Ý tưởng:** Viết xấu (join trước, lọc sau) vs viết tốt (lọc trước, join sau) — optimizer phải tự sửa cho giống nhau.

```js
// 3a xấu: lookup trước, match sau
db.mri_image.explain("executionStats").aggregate([
  { $lookup: { from: "report", ... , as: "rep" } },
  { $match: { modality: "T2", instance_number: 1 } }
])

// 3b tốt: match trước, lookup sau
db.mri_image.explain("executionStats").aggregate([
  { $match: { modality: "T2", instance_number: 1 } },
  { $lookup: { from: "report", ... } }
])
```
**Output:** Hai `winningPlan` **giống hệt**: đều `IXSCAN` trên `idx_ESR` rồi mới `EQ_LOOKUP`, `totalDocsExamined` bằng nhau. Dòng `parsedQuery: { modality:"T2", instance_number:1 }` cho thấy filter đã bị đẩy vào scan.
**Nói:** "Viết xấu hay tốt, plan giống hệt — optimizer tự đẩy phép chọn xuống dưới phép nối, đúng luật #6 Chương 3."

Cặp 3c/3d tương tự nhưng xuất phát từ `report` với `severity:3`.

---

### 3.6. Khối BỔ TRỢ

#### `compound_index` — Quy tắc ESR và covered query

```js
db.mri_image.find({ modality: "T2", instance_number: { $lte: 3 } }).sort({ patient_id: 1 }).limit(20)
```
Câu này có 3 vai: `E` (equality) = `modality`, `S` (sort) = `patient_id`, `R` (range) = `instance_number`.

- Tạo 3 index thử: `idx_RES`, `idx_ERS`, `idx_ESR`
- `hint("idx_RES")` / `hint("idx_ERS")` → vẫn có `SORT` trong plan → chậm
- `hint("idx_ESR")` → **không có `SORT`**, chỉ `IXSCAN → FETCH → LIMIT`, `keysExamined: 23` → thắng. Đây là quy tắc **ESR: Equality → Sort → Range**.

**Covered query:**
```js
db.mri_image.find({ ... }, { _id:0, modality:1, patient_id:1, instance_number:1 }).hint("idx_ESR")
```
Chỉ chiếu các field đã nằm trong index → `PROJECTION_COVERED`, `totalDocsExamined: 0` — trả lời chỉ từ mục lục, không mở document (giống Index-Only Scan của PostgreSQL).
Thêm `file_path` vào projection → phải `FETCH` → `docs: 4279`.

**Multikey:** Index trên `levels` (mảng) không bao giờ cover được vì mỗi phần tử mảng là một key riêng.

#### `plan_cache` — Đua plan và cache

```js
db.mri_image.find({ ... }).explain("allPlansExecution")
```
`explain("allPlansExecution")` = "cho các plan chạy đua thử". Output có `allPlansExecution: [ { indexName, nReturned, works, score }, ... ]` — mỗi plan chạy tới khi trả đủ 101 docs hoặc hết works, plan nào score cao thắng.

```js
db.mri_image.find({ modality:"T2", ... }).explain("queryPlanner").queryPlanner.planCacheShapeHash
db.mri_image.find({ modality:"T1", ... }).explain("queryPlanner").queryPlanner.planCacheShapeHash
```
Hai hash giống nhau (`CD26CF0F`) → cùng **query shape** (hình dạng query bỏ qua hằng số) → lần sau dùng lại plan đã thắng, không đua lại.

```js
db.mri_image.getPlanCache().list()  // Atlas M0 → lỗi
```
Trên M0 free tier sẽ báo `AtlasError` — đây là **minh chứng** cho slide, không phải bug.

#### `pipeline_rewrite` — Pipeline optimizer

```js
// 13a: $addFields rồi $match trên field gốc → $match bị đẩy lên trước → thành IXSCAN
// 13b: $sort + $limit 5 → SORT có limitAmount:5 = top-k sort (chỉ giữ 5 dòng trong RAM)
// 13c: $lookup + $unwind + $match → gộp thành một $lookup (không tạo mảng trung gian)
```
Khi `explain`, nhìn `winningPlan` sẽ thấy thứ tự stage đã bị viết lại so với thứ tự bạn viết.

#### `sort_memory` — Giới hạn 32MB

```js
// 14a: join hết rồi sort, không cho dùng đĩa → lỗi 32MB
db.mri_image.explain("executionStats").aggregate([
  { $lookup: { from:"report", ... } },
  { $sort: { "rep.severity": -1 } }
], { allowDiskUse:false })
// → QueryExceededMemoryLimitNoDiskUseAllowed: Sort exceeded 33554432 bytes
```
Đây là **minh chứng** cho slide — không phải lỗi của bạn.

```js
// 14b: allowDiskUse:true → explain thấy spilled to disk ~93MB (external sort)
// Nhưng .aggregate(...).next() thật trên M0 vẫn lỗi — M0 bỏ qua allowDiskUse khi chạy thật
// 14d: thêm $project nhỏ trước sort → vừa RAM (30MB)
// 14e: thêm $limit 10 sau sort → top-k, chỉ sort 10 dòng
// 14f/g: sort bằng index thay vì SORT stage
```

---

### 3.7. EXTRA

**Text search:**
```js
db.report.find({ clinician_notes: /stenosis/i }).explain("executionStats") // → COLLSCAN (regex không dùng B-tree)
db.report.createIndex({ clinician_notes: "text" })
db.report.find({ $text: { $search: "stenosis" } }).explain("executionStats") // → TEXT + IXSCAN
```
`$text` dùng inverted index (từ → danh sách document) nên nhanh, nhưng chỉ khớp từ khoá, không hiểu nghĩa. Ví dụ `herniation` ra 77 nhưng phần lớn là câu phủ định "No evidence of herniation" — chỉ 1 ca thật có trong field đã chuẩn hoá `findings`.

**SBE vs classic:**
```js
db.mri_image.find({ modality:"T1" }).explain("executionStats").explainVersion // "1" = classic
db.mri_image.explain("executionStats").aggregate([{ $group: {...} }]).explainVersion // "2" = SBE
```
MongoDB 8.0 chạy 2 engine song song: `find` đơn giản ở classic, `$group`/`$lookup` đẩy xuống SBE (nhanh hơn).

**setQuerySettings (MongoDB 8.0):**
```js
db.adminCommand({ setQuerySettings: { find:"mri_image", filter:{modality:"T2"} }, settings:{ indexHints:{...} } })
```
Ghim index cho một query shape. Trên M0 sẽ báo `CommandNotFound` — expected, chỉ để nói như lý thuyết.

---

## 4. Những lỗi bạn sẽ gặp (không phải do bạn gõ sai)

| Lỗi | Nghĩa | Làm gì |
|---|---|---|
| `Sort exceeded memory limit of 33554432 bytes` | Vượt 32MB RAM sort trên M0 | Đúng như slide 14 — đây là minh chứng, không cần sửa |
| `AtlasError` khi `getPlanCache().list()` | M0 không cho đọc plan cache | Expected — chụp lỗi làm minh chứng slide 12 |
| `CommandNotFound` khi `setQuerySettings` | M0 không hỗ trợ ghim plan | Expected — nói như tính năng MongoDB 8.0 |
| `index not found with name [...]` khi `dropIndex` | Index chưa tồn tại | Bỏ qua, không sao |

---

## 5. Checklist khi tự chạy lại

1. Chạy `RESET` trước mỗi lần demo.
2. Mỗi khối copy **từng lệnh**, Enter, đọc output theo bảng Mục 2.
3. So sánh `totalDocsExamined` và `executionTimeMillis` giữa 2 lần chạy — đó là con số để nói.
4. Nếu ra `IXSCAN` ngay từ đầu khi đáng ra `COLLSCAN` → quên `dropIndexes()`.
5. Sau demo: chạy `CLEANUP` để xoá index cho người khác.

