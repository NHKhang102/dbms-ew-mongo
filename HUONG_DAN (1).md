# Gói demo MongoDB v2: chỉ dùng 2 tập dữ liệu Mendeley bắt buộc

**Bỏ hẳn gói cũ** (`mongodb_demo_D.zip`). Gói cũ có bản sao tổng hợp và metadata ảnh giả, trái yêu cầu *"dùng đúng hai tập dữ liệu"*.

Nếu đã import gói cũ vào Atlas, mở shell Compass và xoá:

```
use mri_demo
db.reports.drop(); db.mri_image.drop(); db.finding_dict.drop(); db.lumbar_records_benchmark.drop()
```

## Dữ liệu trong gói v2

### `report`: ghi chú bác sĩ X-quang

- **Nguồn:** https://data.mendeley.com/datasets/s6bgczr8s2/2
- **Dữ liệu gốc giữ nguyên:** đủ 575 dòng thật, gồm `patient_id` và `clinician_notes`.
- **Trường dẫn xuất**, tách bằng regex từ chính ghi chú để có field truy vấn và tạo index được:
  - `levels`, `primary_level`, `level_count`
  - `findings`
  - `nerve_compression`, `thecal_sac_compression`
  - `severity`: từ 0 đến 3, tính bằng luật, không phải chẩn đoán
  - `has_note`
- **Lưu ý:** 60 dòng gốc không có ghi chú.
- **File:** `data/report.ndjson`, đã tạo sẵn, chỉ việc import.

### `mri_image`: ảnh MRI cột sống thắt lưng

- **Nguồn:** https://data.mendeley.com/datasets/k57fr854j2/2
- **Mỗi document là 1 lát cắt DICOM thật.** Tập dữ liệu có 515 bệnh nhân, 48.345 lát.
- **Chỉ đưa header lên Atlas, không đưa pixel.** Pixel không cần cho tối ưu truy vấn, và toàn bộ ảnh vượt giới hạn 512 MB.
- **Các trường:**
  - `patient_id`
  - `study_folder`, `series_number`, `series_description`
  - `modality` (T1/T2/STIR…, theo quy ước của nhóm)
  - `plane` (SAGITTAL/AXIAL)
  - `instance_number`, `slice_location`, `slice_thickness_mm`
  - `rows`, `columns`
  - `file_path` (đường dẫn tới file ảnh)
- **File:** bạn tự tạo bằng `extract_dicom_meta.py` từ thư mục ảnh trên máy (bước 1).

### Dùng chung với PostgreSQL

Tên bảng và tên cột khớp tài liệu nhóm (`report`, `mri_image`, `patient_id`, `modality`, `plane`). Gửi E thư mục `postgres/`, gồm `report.csv` và `load_postgres.sql`, kèm file `mri_image.csv` sinh ra ở bước 1.

---

## CHECKLIST TỐI NAY

### 1. Trích header DICOM (~15–30 phút)

1. **Cài Python** từ https://www.python.org/downloads/. Khi cài, **tick ô "Add python.exe to PATH"**.
2. **Cài thư viện pydicom.** Mở *Command Prompt* rồi gõ:
   ```
   pip install pydicom
   ```
3. **Chạy script.** Vào thư mục gói v2, gõ `cmd` vào thanh địa chỉ của File Explorer rồi Enter để mở Command Prompt tại đó. Thay đường dẫn bằng thư mục ảnh MRI đã giải nén:
   ```
   python extract_dicom_meta.py "D:\duong\dan\thu_muc_anh_MRI"
   ```
   Thư mục đúng là thư mục chứa các thư mục con của từng bệnh nhân, ví dụ `0001`, `0002`…
4. **Đọc thống kê in ra cuối:**
   - Số lát phải xấp xỉ **48.345**. Nếu bạn chỉ tải một phần ảnh thì ít hơn, vẫn được.
   - Khoảng `patient_id` phải nằm trong **1–575**, để khớp với `report`.
   - `modality` phải có T1 và T2; `plane` phải có SAGITTAL và AXIAL.
   - Nếu `patient_id` ra số lạ, hoặc báo "không xác định", **chụp màn hình thống kê và cây thư mục gửi mình** trước khi import.
5. **Kết quả:** `mri_image.ndjson` (cho MongoDB) và `mri_image.csv` (copy vào thư mục `postgres/` để gửi E).

### 2. Import vào Atlas bằng Compass (~10 phút)

6. **Tạo database.** Trong Compass bấm **+** cạnh tên kết nối, chọn *Create database*. Database `mri_demo`, collection `report`.
7. **Import `report`.** Bấm vào `report`, chọn **ADD DATA → Import JSON or CSV file**, chọn `data/report.ndjson`, rồi Import. Nếu không thấy file thì chọn *All files* hoặc đổi đuôi thành `.json`.
8. **Import `mri_image`.** Bấm **+** cạnh `mri_demo` để tạo collection `mri_image`, rồi import `mri_image.ndjson`.
9. **Kiểm tra.** Mở shell (**`>_` Open MongoDB shell**):
   ```
   use mri_demo
   db.report.countDocuments()      // 575
   db.mri_image.countDocuments()   // ~48345
   ```

### 3. Chạy demo trong shell Compass (~60 phút)

10. Mở `demo.mongodb.js` bằng Notepad, bấm Ctrl+A rồi Ctrl+C.
11. Trong shell, gõ `SECTIONS = ["D0"]` rồi Enter. Dán script, Enter. Đọc dòng *"report có ảnh tương ứng: x / 575"*:
    - Nếu x = 0, `patient_id` hai bên không khớp. **Dừng lại và báo mình.**
12. **Làm lần lượt D1 đến D9.** Mỗi lần gõ `SECTIONS = ["Dx"]`, dán script, chụp màn hình, rồi copy kết quả vào file `ket_qua_demo.txt` (phương án dự phòng).
    - D5a chậm vài giây là đúng: đó là Nested Loop Join không có index.
    - Muốn chạy đúng nguyên bản A.3 (cả 575 report, không index, có thể mất 30 giây trở lên), gõ thêm `FULL_NLJ = true` trước khi dán script.
13. **Chụp cây plan dạng hình cho Mạch 1.** Vào collection `mri_image` → tab Documents → Filter `{ patient_id: 1, modality: "T2" }` → bấm **Explain** → chọn *Visual Tree*.
    - Ảnh *trước*: vào tab Indexes, xoá `pid_mod`, rồi Explain.
    - Ảnh *sau*: Create Index `patient_id: 1, modality: 1`, rồi Explain lại.
14. **Chụp cây plan cho Mạch 2 và 3.** Vào tab **Aggregations**, dán pipeline của D5 và D6 (bên dưới) rồi bấm **Explain**.
15. *(Tuỳ chọn)* Tạo Atlas Search index tên `default` cho collection `report` để chạy D8d.

### 4. Slide (~90 phút)

16. **Slide 17 "Demo trực tiếp (Mongo)" chỉ có 2 phút**, nên chạy live đúng 3 mạch của A.3: **D1 (Mạch 1), D5 (Mạch 2), D6a–b (Mạch 3)**.
17. **Các phần còn lại là minh chứng có ảnh chụp** cho các slide MongoDB. Gửi ảnh cho C:

| Phần demo | Đưa vào slide | Chứng minh mục |
|---|---|---|
| D2, D3 | Slide 11 (ánh xạ S1–S8, ESR) | E4(c) |
| D4 | Slide 12 (chạy đua plan, plan cache, tỉ lệ docsExamined/nReturned) | E4(a), (e) |
| D6c–g | Slide 13 (pipeline optimizer) | E4(d) |
| D5d–f, D7 | Slide 14 (điểm yếu, sau khi đã sửa) | |
| D8, D9 | Slide 5 hoặc 14 (kỹ thuật hiện đại: inverted index, Atlas Search, SBE, Query Settings) | |

18. Gửi trưởng nhóm, C và E **danh sách sửa tài liệu nhóm** ở mục cuối.
19. Chạy thử phần live 2 phút và bấm giờ.

---

## Nội dung slide từng demo

Số liệu cụ thể bạn lấy từ `ket_qua_demo.txt`. Chỉ số chính cần nhấn là **`totalDocsExamined / nReturned`**: theo mục E4(e), đây là *"selectivity trong thực tế"*.

### Mạch 1 (D1): S1 → S6/S8

- **Truy vấn:** `db.mri_image.find({ patient_id: P, modality: "T2" })`
- **Trước:** `COLLSCAN`. `docsExamined` ≈ 48 nghìn lát, `nReturned` chỉ vài chục, nên tỉ lệ rất lớn.
- **Sau** `createIndex({patient_id:1, modality:1})`: `FETCH ← IXSCAN`, `docsExamined = nReturned`, tỉ lệ bằng 1.
- **D1c:** tìm theo `_id` (S3) dùng *express path* của MongoDB 8.0.
- **D1d/e:** điều kiện chọn gần hết bảng mà MongoDB **vẫn dùng IXSCAN**, và ép COLLSCAN thường nhanh hơn. Lý do: MongoDB không ước lượng chi phí, còn PostgreSQL thì có và sẽ chọn Seq Scan.
- **Câu chốt:** *"Cả hai DBMS đều đi từ S1 sang S8. Cùng ý tưởng của Chương 3, cú pháp khác."*

### D2: Chỉ mục ghép, quy tắc ESR

- **Truy vấn:** `find({modality:"T2", instance_number:{$lte:3}}).sort({patient_id:1}).limit(20)`
- **So sánh 3 thứ tự field trong index:**
  - R-E-S và E-R-S: vẫn phải có `SORT` trong RAM.
  - **ESR** `{modality, patient_id, instance_number}`: **không có SORT**, chỉ duyệt khoảng vài trăm key rồi dừng nhờ `limit`.

### D3: Covered query (Index-Only Scan)

- **D3a:** chỉ chiếu các field có trong index → `PROJECTION_COVERED`, `totalDocsExamined = 0`.
- **D3b:** thêm `file_path` vào projection → phải `FETCH` document.
- **D3c:** index trên mảng `report.levels` (multikey) không cover được.

### D4: Optimizer MongoDB

- `allPlansExecution` hiện 3 plan ứng viên. Mỗi plan được "chạy thử" cho tới khi một plan trả đủ 101 kết quả hoặc hết hạn mức works. Plan thắng được cache theo **query shape**: đổi hằng số (T1, ≤5) thì hash giữ nguyên.
- `getPlanCache().list()` có thể báo lỗi trên M0. Đó là giới hạn của bản free; chụp lại làm minh chứng.

### Mạch 2 (D5): JOIN

Pipeline đúng như A.3:
```
[ { $lookup: { from:"mri_image", localField:"patient_id", foreignField:"patient_id", as:"images" } },
  { $match: { "images.modality": "T2" } } ]
```

| Bước | `strategy` trong explain | Ghi chú |
|---|---|---|
| D5a: chưa có index `mri_image.patient_id` | `NestedLoopJoin` (J1) | Mỗi report quét toàn bộ khoảng 48k lát |
| D5b, D5c: có index | `IndexedLoopJoin` (J2) | Nhanh hơn nhiều |
| D5d: lát T2 ⋈ report (575 docs), không index, `allowDiskUse:true` | MongoDB 8.0 tự cài: **`HashJoin`** (J4). Atlas M0: `NestedLoopJoin`, vì M0 bỏ qua `allowDiskUse` | |
| D5e, D5f | | Không có allowDiskUse thì ra NLJ; có index thì ra ILJ |

**Câu chốt:** *"MongoDB 8.0 có 3 thuật toán join J1, J2, J4, nhưng không có J3 sort-merge. Lựa chọn phụ thuộc index, kích thước bảng ngoại và cấu hình môi trường."*

### Mạch 3 (D6): Heuristic, đẩy σ xuống

- **D6a "xấu"** `[$lookup report, $match {modality:"T2", instance_number:1}]` và **D6b "tốt"** `[$match, $lookup]`: script in ra **"GIỐNG HỆT NHAU ✔"**. Optimizer đã tự đẩy `$match` xuống dưới join (luật #6), giống PostgreSQL.
- **D6c/d:** cùng ý nhưng xuất phát từ `report` (`$match severity:3`).
- **D6e:** `$addFields → $match` thì `$match` được đưa lên trước.
- **D6f:** `$sort + $limit` gộp thành sort top-k.
- **D6g:** `$lookup + $unwind + $match` gộp thành 1 stage.

### D7: External sort

- **D7a:** join mọi lát với `report`, rồi sort theo field của bảng join. Trên M0 dễ ra lỗi *"Sort exceeded memory limit of 33554432 bytes"* (32 MB), và không thể sort tràn ra đĩa vì M0 bỏ qua allowDiskUse. Nếu dữ liệu vừa RAM thì script in "THÀNH CÔNG"; khi đó dùng D7d/e để minh hoạ.
- **D7b:** `$project` bớt field trước khi sort (đẩy π xuống) thì bản ghi nhỏ đi và vừa bộ nhớ.
- **D7c:** thêm `$limit` thành sort top-k.
- **D7d/e:** có index trên field sort thì không còn stage `SORT`.

### D8: Ghi chú văn bản

- Regex `/stenosis/i` dẫn tới `COLLSCAN`; text index (inverted index) chạy bằng `IXSCAN`.
- `$text "herniation"` khớp **77** report, phần lớn là câu phủ định *"No evidence of disc herniation"*. Trường dẫn xuất `findings` chỉ có **1** report thật sự có thoát vị.
- **Câu chốt:** *"Index nhanh nhưng không hiểu ngữ nghĩa; tiền xử lý dữ liệu cũng là tối ưu."*

### D9: MongoDB ngày nay

- `find()` thường chạy classic engine; `$group` được đẩy xuống **SBE** (Slot-Based Execution).
- `setQuerySettings` (8.0) gắn index cố định cho một query shape. M0 không hỗ trợ, nên chỉ chụp lỗi và trình bày như lý thuyết.

### PostgreSQL tương ứng (gửi E để so sánh song song)

```sql
-- Mạch 1
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM mri_image WHERE patient_id = 1 AND modality = 'T2';
CREATE INDEX idx_img_pid_mod ON mri_image (patient_id, modality); ANALYZE mri_image;
-- Mạch 2
SET enable_hashjoin = off; SET enable_mergejoin = off;
EXPLAIN ANALYZE SELECT r.clinician_notes, i.file_path
  FROM report r JOIN mri_image i ON i.patient_id = r.patient_id WHERE i.modality = 'T2';
RESET enable_hashjoin; RESET enable_mergejoin;   -- chạy lại → planner tự chọn (thường Hash Join)
-- Mạch 3
EXPLAIN SELECT * FROM (SELECT r.*, i.file_path, i.modality FROM report r
  JOIN mri_image i ON i.patient_id = r.patient_id) t WHERE t.modality = 'T2';
-- Điểm khác MongoDB (D1d)
EXPLAIN ANALYZE SELECT * FROM mri_image WHERE patient_id >= 1;   -- PG chọn Seq Scan
```

---

## Danh sách sửa tài liệu nhóm (gửi trưởng nhóm, C và E)

1. **A.0, dòng J4 và slide 14:** câu *"MongoDB không hỗ trợ hash join"* đã lỗi thời. MongoDB 8.0 có `HashJoin` cho `$lookup`, điều kiện: `allowDiskUse`, collection ngoại nhỏ (≤ 10.000 docs) và không có index. Atlas M0 không dùng được vì bỏ qua `allowDiskUse`. Điểm yếu đúng là: không có J3 Sort-Merge.
2. **A.0, dòng J1:** `$lookup` không chỉ có nested-loop; còn có `IndexedLoopJoin` và `HashJoin`.
3. **A.0, dòng External sort:** con số 100 MB đúng với MongoDB tự cài. Atlas M0 giới hạn **32 MB** và bỏ qua `allowDiskUse`.
4. **A.3, phần dữ liệu:** ghi chú bác sĩ và ảnh là **2 bảng riêng**: `report(patient_id, clinician_notes, …)` và `mri_image(patient_id, modality, plane, file_path, …)`. Không gộp `modality` hay `plane` vào `report`. Trường "body" chính là `clinician_notes`.
5. **A.3, Mạch 1:** `patient_id` trong dữ liệu thật là **số** (1–575), không phải chuỗi `'P0123'`. Truy vấn `patient_id + modality` phải chạy trên `mri_image`.
6. **A.3, Mạch 3 phía MongoDB:** `{$match:{modality:"T2"}}` đặt trên `report` sẽ không khớp gì, vì `report` không có `modality`. Thay bằng D6a/D6b (xuất phát từ `mri_image`) hoặc D6c/D6d.
7. **A.3, lệnh `docker run … mongo:7`:** phía MongoDB dùng Atlas (8.0). Nếu vẫn muốn demo HashJoin trên máy thì dùng `mongo:8.0`.
8. **E4(a), "~101 dòng đầu":** nói chính xác là các plan chạy thử cho tới khi một plan trả đủ 101 kết quả, hoặc hết hạn mức works (mặc định 10.000 works hoặc 30% số document), rồi chọn plan có điểm cao nhất.
