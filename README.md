# Demo MongoDB — EW (Xử lý & tối ưu truy vấn)

Chạy các demo phía MongoDB của đề xuất nhóm (A.3 và slide 11–17) trên dữ liệu Atlas `mri_demo`.
Dữ liệu là 2 tập Mendeley bắt buộc: `report` (575 ghi chú X-quang) và `mri_image` (header DICOM).
Các script **chỉ tạo/xoá index**, không thêm, sửa hay xoá document.

Kịch bản demo và thuyết trình (lệnh copy-paste, câu nói, hỏi đáp): [PRESENTATION_GUIDE.md](PRESENTATION_GUIDE.md).
Tài liệu cho người mới (giải thích từng lệnh + output): [GIAI_THICH_LENH_VA_OUTPUT.md](GIAI_THICH_LENH_VA_OUTPUT.md).
Demo không cần VS Code (chạy thẳng trên Atlas website / Compass): [ATLAS_COMPASS_GUIDE.md](ATLAS_COMPASS_GUIDE.md) + file lệnh [`demos/atlas_compass_queries.js`](demos/atlas_compass_queries.js).

## Cài đặt (Ubuntu / WSL, làm 1 lần)

1. Cần Node.js và `npx` trong PATH (`node -v`). Lần chạy đầu `npx` tự tải `mongosh@2.13.0`; không cần cài mongosh hay Docker.
2. `cp .env.example .env`, rồi mở `.env` và dán connection string Atlas vào `MONGODB_URI`. Không commit hay gửi file này.
3. Atlas → **Network Access**: thêm IP hiện tại của máy.
4. Chạy `./run.sh check_data`. Mọi dòng phải có dấu ✔, cuối cùng in ra "RESULT: ✔ the data matches the team guide".

## Chạy

Trong terminal của VS Code:

```bash
./run.sh                 # xem danh sách demo
./run.sh check_data      # kiểm tra kết nối + dữ liệu
./run.sh demo1           # một demo (gõ phần đầu tên là đủ: demo1 = demo1_selection)
./run.sh live            # 3 mạch chạy live ở slide 17
./run.sh all             # check_data + 3 mạch + 4 demo bổ trợ
./run.sh extra           # 2 demo ngoài đề xuất
./run.sh shell           # mongosh tương tác, để gõ truy vấn trực tiếp
./run.sh cleanup         # xoá index do demo tạo
```

Hoặc dùng menu: `Ctrl+Shift+P` → **Tasks: Run Task** → **MongoDB demo: …**

## Kết quả

Chỉ có một thư mục `results/`. Mỗi lần chạy **ghi đè** file của demo đó:

- `results/<demo>.txt`: toàn bộ output bằng tiếng Anh. Mỗi demo mở đầu bằng khung giới thiệu (Topic, Proposal, Chapter 3, Watch for). Mỗi bước in theo thứ tự:
  - `Concept`: khái niệm Chương 3 / kỹ thuật MongoDB mà bước đó minh hoạ
  - `Query`: câu lệnh mongosh đúng như chạy
  - `Engine`: classic hay SBE, có bao nhiêu plan ứng viên chạy đua
  - `Plan`: cây plan, mỗi stage kèm một dòng giải thích, bounds của index, filter
  - `Pushed down` / `As written` / `Runs as` (chỉ với aggregate): optimizer đã đẩy filter xuống và đổi thứ tự stage thế nào
  - `Join`, `Sort`: chiến lược join (kèm tên J1/J2/J4), dung lượng sort và có tràn ra đĩa không
  - `Result`: số trả về, số key/document đã đọc, docs examined per result, thời gian server
  - `Note`: cách đọc kết quả

  Cuối mỗi demo có phần TAKEAWAY và bảng `### Summary`.
- `results/SUMMARY.md`: bảng tóm tắt mới nhất của **mọi** demo (dựng lại sau mỗi lần chạy, ghi rõ từng demo chạy lúc nào).

## Các demo bám đề xuất ở đâu

| File (`demos/`) | Bám đề xuất | Nội dung | Mã cũ trong HUONG_DAN |
|---|---|---|---|
| `check_data` | HUONG_DAN bước 9, 11 | Đếm document, kiểm tra trường, patient_id hai bên có khớp | D0 |
| `demo1_selection` | **A.3 Mạch 1**, slide 17 | S1 `COLLSCAN` → S6/S8 `IXSCAN`; S3 theo `_id`; MongoDB không ước lượng chi phí (1d/1e) | D1 |
| `demo2_join` | **A.3 Mạch 2**, slide 14, 17 | `$lookup`: J1 NestedLoop → J2 IndexedLoop → J4 HashJoin; không có J3 | D5 |
| `demo3_pushdown` | **A.3 Mạch 3**, slide 13, 17 | Luật #6: `$match` sau `$lookup` bị đẩy lên trước, plan giống hệt | D6a–d |
| `compound_index` | E4(c), A.0 dòng S2, S7/S8 — *dùng cho slide 11* | Thứ tự field theo ESR; covered query (≈ Index-Only Scan) | D2, D3 |
| `plan_cache` | E4(a), E4(e) — *dùng cho slide 12* | Chạy đua candidate plan, query shape, plan cache | D4 |
| `pipeline_rewrite` | E4(d) — *dùng cho slide 13* | Pipeline optimizer: `$addFields`+`$match`, `$sort`+`$limit`, `$lookup`+`$unwind` | D6e–g |
| `sort_memory` | A.0 dòng External sort — *dùng cho slide 14* | Giới hạn 32 MB, tràn ra đĩa (external sort), đẩy π xuống, top-k, index thay sort | D7 |
| `extra_text_search` | *Ngoài đề xuất* | Regex vs text index trên ghi chú bác sĩ | D8 |
| `extra_sbe_engine` | *Ngoài đề xuất* | Classic engine vs SBE, `setQuerySettings` | D9 |
| `cleanup` | — | Xoá index do demo tạo | — |

## Demo trực tiếp

### Cách A — VS Code (`./run.sh shell`, khuyên dùng khi có Node.js)

`./run.sh shell` mở mongosh đã kết nối sẵn tới `mri_demo` và nạp sẵn các helper. Bạn gõ truy vấn MongoDB như bình thường, bọc trong `show(...)` để có output dễ đọc giống các file demo:

```js
db.mri_image.dropIndexes()
show(db.mri_image, { patient_id: 1, modality: "T2" })          // COLLSCAN
db.mri_image.createIndex({ patient_id: 1, modality: 1 })
show(db.mri_image, { patient_id: 1, modality: "T2" })          // IXSCAN

show(db.mri_image, [ { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } },
                     { $match: { modality: "T2", instance_number: 1 } } ])
show(db.mri_image, [ { $match: { modality: "T2", instance_number: 1 } },
                     { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } } ])
compareLast()                                                   // ✔ SAME PLAN

load("demos/demo2_join.js")                                     // chạy nguyên một demo
```

`explain("executionStats")` gốc vẫn dùng được, nhưng in ra hơn 100 dòng JSON, khó theo dõi khi trình chiếu.

### Cách B — Atlas website / Compass (không cần VS Code)

Mở Compass hoặc Atlas → `Browse Collections` → Shell (`>_ Open MongoDB shell`), rồi copy từng khối trong [`demos/atlas_compass_queries.js`](demos/atlas_compass_queries.js) và dán vào Shell. Toàn bộ query đều là `mongosh` thuần (`find().explain()`, `aggregate().explain()`), chạy được 100% mà không cần `lib/common.js`. Hướng dẫn chi tiết + kịch bản 2 phút + cách đọc output thuần: [ATLAS_COMPASS_GUIDE.md](ATLAS_COMPASS_GUIDE.md).

## Lưu ý

- Demo xoá và tạo lại index trên `report`/`mri_image`. Đừng chạy cùng lúc với người khác trong nhóm trên cùng cluster.
- Những gì đã kiểm chứng trên Atlas M0 (MongoDB 8.0.34):
  - 2d ra **HashJoin**.
  - Sort giới hạn **32 MB**: 14a báo lỗi; 14b (explain) tràn ra đĩa khoảng 94 MB; 14c chạy thật vẫn bị từ chối dù bật `allowDiskUse`.
  - Không cho `getPlanCache().list()` (12c) và không có `setQuerySettings` (Sc).

  Các lỗi này đã được dự kiến: output in kèm `Note` giải thích, và chính lỗi đó là minh chứng cho slide.
- `demo2_join` mặc định chỉ chạy NLJ không index trên 10 report. `FULL_NLJ=1 ./run.sh demo2` chạy thêm bản đầy đủ của A.3 (chậm).
