// demos/atlas_compass_queries.js — 100% mongosh thuần cho Atlas Website / Compass Shell
// Không cần VS Code, không cần lib/common.js, không cần show().
// Cách dùng: mở file này, copy TỪNG KHỐI (3–10 dòng) và dán vào Shell của Atlas (nút Shell)
// hoặc Compass (panel >_ Open MongoDB shell). Đừng dán cả file một lần.
// Mọi khối đã ghi sẵn "→ nhìn gì" để biết chỉ vào đâu khi chiếu.
// Chi tiết + kịch bản 2 phút: xem ATLAS_COMPASS_GUIDE.md
//
// Nếu Shell chưa ở database mri_demo, chạy dòng đầu tiên trước:
db = db.getSiblingDB("mri_demo");

// ============================================================================
// 0. KIỂM TRA DATA (giống ./run.sh check_data)
// ============================================================================
// → nhìn: 575 reports, ~48345 slices, patient_id khớp
db.report.countDocuments()           // 575
db.mri_image.countDocuments()        // 48345
db.report.distinct("patient_id").length
db.mri_image.distinct("patient_id").length
db.report.countDocuments({ has_note: false })  // 60 dòng không có ghi chú (đúng HUONG_DAN)
db.mri_image.distinct("modality")    // phải có T1, T2
db.mri_image.distinct("plane")       // phải có SAGITTAL, AXIAL
// Nếu muốn xem document mẫu:
db.report.findOne({}, { _id: 0 })
db.mri_image.findOne({}, { _id: 0 })


// ============================================================================
// RESET — chạy trước khi demo live để Mạch 1 bắt đầu từ "chưa có index"
// Giống ./run.sh cleanup
// ============================================================================
db.mri_image.dropIndexes()
db.report.dropIndexes()
db.mri_image.getIndexes()  // chỉ còn _id_
db.report.getIndexes()     // chỉ còn _id_


// ============================================================================
// MẠCH 1 — SELECT S1 → S6/S8 (A.3 Mạch 1, slide 17) — 40 giây
// Câu hỏi: những lát T2 của bệnh nhân 1?
// ============================================================================

// 1a. Chưa có index → COLLSCAN (S1)
// → nhìn: winningPlan.stage = "COLLSCAN", totalDocsExamined = 48345, nReturned = 30
db.mri_image.dropIndexes()
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats")
// Mẹo chỉ in con số (đỡ lướt JSON dài):
// db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats").executionStats.totalDocsExamined
// db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats").executionStats.nReturned
// Compass UI thay thế: Documents → Filter { patient_id: 1, modality: "T2" } → Explain → Visual Tree → COLLSCAN

// 1b. Thêm index ghép → IXSCAN (S6/S8)
// → nhìn: FETCH <- IXSCAN pid_mod, indexBounds: patient_id [1,1] x modality ["T2","T2"], totalDocsExamined = 30
db.mri_image.createIndex({ patient_id: 1, modality: 1 })
db.mri_image.find({ patient_id: 1, modality: "T2" }).explain("executionStats")
// Compass UI: Documents → Filter như trên → Explain → Visual Tree → IXSCAN + FETCH

// 1c. Theo _id → EXPRESS_IXSCAN (S3, fast path MongoDB 8.0)
// → nhìn: stage = "EXPRESS_IXSCAN" (bỏ qua planner), docs = 1
var anyId = db.mri_image.findOne({}, { _id: 1 })._id
db.mri_image.find({ _id: anyId }).explain("executionStats")

// 1d. Filter gần hết bảng — MongoDB vẫn dùng IXSCAN (không có cost model)
// → nhìn: vẫn IXSCAN dù đọc 48345 docs, khác PostgreSQL sẽ chọn Seq Scan
db.mri_image.find({ patient_id: { $gte: 1 } }).explain("executionStats")

// 1e. Ép COLLSCAN bằng hint để so thời gian với 1d
// → nhìn: stage = "COLLSCAN", so executionTimeMillis với 1d (COLLSCAN thường nhanh hơn ở đây)
db.mri_image.find({ patient_id: { $gte: 1 } }).hint({ $natural: 1 }).explain("executionStats")


// ============================================================================
// MẠCH 2 — JOIN J1 → J2 → J4 với $lookup (A.3 Mạch 2, slide 14 & 17) — 45 giây
// ============================================================================

// 2a. Chưa có index trên mri_image.patient_id → NestedLoopJoin (J1)
// Chỉ lấy 10 report đầu để khỏi chậm (đủ thấy ~484k docs). Trên UI: Aggregations → dán pipeline → Explain
// → nhìn: strategy = "NestedLoopJoin" (J1), totalDocsExamined ~ 483k, executionTimeMillis lớn
db.mri_image.dropIndexes()  // đảm bảo không còn index trên patient_id
db.report.explain("executionStats").aggregate([
  { $match: { patient_id: { $lte: 10 } } },
  { $lookup: { from: "mri_image", localField: "patient_id", foreignField: "patient_id", as: "images" } },
  { $match: { "images.modality": "T2" } }
])

// 2b. Có index → IndexedLoopJoin (J2), cùng 10 reports
// → nhìn: strategy = "IndexedLoopJoin" (J2), totalDocsExamined ~ 744, nhanh hơn 2a rất nhiều
db.mri_image.createIndex({ patient_id: 1 })
db.report.explain("executionStats").aggregate([
  { $match: { patient_id: { $lte: 10 } } },
  { $lookup: { from: "mri_image", localField: "patient_id", foreignField: "patient_id", as: "images" } },
  { $match: { "images.modality": "T2" } }
])

// 2c. J2 trên toàn bộ reports (không giới hạn 10 nữa)
// → nhìn: vẫn IndexedLoopJoin, nReturned = 515, docs ~ 48k
db.report.explain("executionStats").aggregate([
  { $lookup: { from: "mri_image", localField: "patient_id", foreignField: "patient_id", as: "images" } },
  { $match: { "images.modality": "T2" } }
])

// 2d. mri_image ⋈ report — inner nhỏ (575 docs) + allowDiskUse:true → HashJoin (J4)
// → nhìn: strategy = "HashJoin" (J4), chỉ khi: không index + allowDiskUse + foreign ≤10k docs
db.report.dropIndex("patient_id_1")  // nếu báo lỗi thì bỏ qua (chưa có index)
db.mri_image.explain("executionStats").aggregate([
  { $match: { modality: "T2", instance_number: 1 } },
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } }
], { allowDiskUse: true })

// 2e. Cùng join nhưng allowDiskUse:false → quay về NestedLoop (J1)
// → nhìn: strategy = "NestedLoopJoin" lại, docs ~847k, chậm hơn 2d
db.mri_image.explain("executionStats").aggregate([
  { $match: { modality: "T2", instance_number: 1 } },
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } }
], { allowDiskUse: false })

// 2f. Có index trên report.patient_id → lại IndexedLoopJoin (J2), ưu tiên hơn HashJoin
// → nhìn: strategy = "IndexedLoopJoin" dù vẫn allowDiskUse:true (rule cố định, không so cost)
db.report.createIndex({ patient_id: 1 })
db.mri_image.explain("executionStats").aggregate([
  { $match: { modality: "T2", instance_number: 1 } },
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } }
], { allowDiskUse: true })


// ============================================================================
// MẠCH 3 — HEURISTIC: ĐẨY $match XUỐNG DƯỚI $lookup (luật #6) — 35 giây
// Viết xấu (lookup trước, match sau) vs viết tốt (match trước) → plan phải GIỐNG HỆT
// ============================================================================
db.mri_image.createIndex({ modality: 1, patient_id: 1, instance_number: 1 })
db.mri_image.createIndex({ patient_id: 1 })
db.report.createIndex({ patient_id: 1 })

// --- Cặp 1: lát đầu của mỗi series T2, join với report ---
// 3a. Viết xấu: $lookup trước, $match sau
// → nhìn: winningPlan có IXSCAN idx_ESR dù viết lookup trước → optimizer đã đẩy match xuống
db.mri_image.explain("executionStats").aggregate([
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } },
  { $match: { modality: "T2", instance_number: 1 } }
])

// 3b. Viết tốt: $match trước, $lookup sau
// → nhìn: winningPlan GIỐNG HỆT 3a (so toàn bộ JSON), totalDocsExamined bằng nhau = optimizer tự rewrite
db.mri_image.explain("executionStats").aggregate([
  { $match: { modality: "T2", instance_number: 1 } },
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } }
])
// Để so nhanh: chạy cả hai .explain("executionStats").queryPlanner.winningPlan và so bằng mắt,
// hoặc dùng .explain("executionStats").executionStats.totalDocsExamined — phải bằng nhau.

// --- Cặp 2: ca nặng severity=3 với mọi lát ---
// 3c. Viết xấu: lookup trước
db.report.explain("executionStats").aggregate([
  { $lookup: { from: "mri_image", localField: "patient_id", foreignField: "patient_id", as: "images" } },
  { $match: { severity: 3 } }
])
// 3d. Viết tốt: match trước
db.report.explain("executionStats").aggregate([
  { $match: { severity: 3 } },
  { $lookup: { from: "mri_image", localField: "patient_id", foreignField: "patient_id", as: "images" } }
])
// → nhìn: hai plan giống hệt, parsedQuery = {severity:3} đã bị đẩy vào scan


// ============================================================================
// BỔ TRỢ — 4 demo theo mục đích (compound_index, plan_cache, pipeline_rewrite, sort_memory)
// Mỗi khối đều chạy được trong Atlas/Compass Shell y hệt.
// ============================================================================

// --- compound_index: ESR + covered query (dùng cho slide 11) ---
db.mri_image.dropIndexes()
db.mri_image.createIndex({ instance_number: 1, modality: 1, patient_id: 1 }, { name: "idx_RES" })
db.mri_image.createIndex({ modality: 1, instance_number: 1, patient_id: 1 }, { name: "idx_ERS" })
db.mri_image.createIndex({ modality: 1, patient_id: 1, instance_number: 1 }, { name: "idx_ESR" })

// 11a. Không index → COLLSCAN + SORT trong RAM
db.mri_image.find({ modality: "T2", instance_number: { $lte: 3 } }).sort({ patient_id: 1 }).limit(20).explain("executionStats")
// 11b/c/d. Ép từng thứ tự bằng hint để thấy ESR thắng
db.mri_image.find({ modality: "T2", instance_number: { $lte: 3 } }).sort({ patient_id: 1 }).limit(20).hint("idx_RES").explain("executionStats") // R-E-S → vẫn SORT
db.mri_image.find({ modality: "T2", instance_number: { $lte: 3 } }).sort({ patient_id: 1 }).limit(20).hint("idx_ERS").explain("executionStats") // E-R-S → vẫn SORT
db.mri_image.find({ modality: "T2", instance_number: { $lte: 3 } }).sort({ patient_id: 1 }).limit(20).hint("idx_ESR").explain("executionStats") // E-S-R → KHÔNG SORT, chỉ 23 keys
// Covered query: chỉ đọc index, 0 document
db.mri_image.find({ modality: "T2", instance_number: { $lte: 3 } }, { _id: 0, modality: 1, patient_id: 1, instance_number: 1 }).hint("idx_ESR").explain("executionStats") // → PROJECTION_COVERED
// Thêm file_path → phải FETCH
db.mri_image.find({ modality: "T2", instance_number: { $lte: 3 } }, { _id: 0, modality: 1, patient_id: 1, instance_number: 1, file_path: 1 }).hint("idx_ESR").explain("executionStats")
// Multikey (array levels) không cover được:
var lv = db.report.findOne({ "levels.0": { $exists: true } }, { levels: 1 })
db.report.createIndex({ levels: 1 })
db.report.find({ levels: lv.levels[0] }, { _id: 0, levels: 1 }).explain("executionStats")

// --- plan_cache: đua plan + cache (dùng cho slide 12) ---
// 12a. Cho optimizer tự chọn giữa 3 index ESR (không hint) → đua plan
db.mri_image.find({ modality: "T2", instance_number: { $lte: 3 } }).sort({ patient_id: 1 }).limit(20).explain("allPlansExecution")
// → nhìn: allPlansExecution.length = 3, mỗi plan có nReturned/works/score, winningPlan là idx_ESR
// 12b. Đổi hằng số → hash giữ nguyên (cache hit)
db.mri_image.find({ modality: "T2", instance_number: { $lte: 3 } }).sort({ patient_id: 1 }).limit(20).explain("queryPlanner").queryPlanner.planCacheShapeHash
db.mri_image.find({ modality: "T1", instance_number: { $lte: 5 } }).sort({ patient_id: 1 }).limit(20).explain("queryPlanner").queryPlanner.planCacheShapeHash
// → nhìn: hai hash giống nhau (CD26CF0F)
// 12c. Đọc plan cache — trên M0 sẽ lỗi (expected, làm minh chứng slide)
db.mri_image.getPlanCache().list()  // Atlas M0 → AtlasError (không cho $planCacheStats)

// --- pipeline_rewrite: aggregation pipeline optimizer (dùng cho slide 13) ---
// 13a. $addFields → $match trên field gốc → $match bị đẩy lên trước → thành IXSCAN
db.mri_image.explain("executionStats").aggregate([
  { $addFields: { pixels: { $multiply: ["$rows", "$columns"] } } },
  { $match: { modality: "T1" } }
])
// 13b. $sort + $limit → top-k sort (giữ 5 dòng, không sort hết)
db.mri_image.explain("executionStats").aggregate([
  { $sort: { slice_location: -1 } },
  { $limit: 5 }
])
// → nhìn: SORT có limitAmount = 5
// 13c. $lookup + $unwind + $match → gộp vào $lookup (không tạo array trung gian)
db.report.explain("executionStats").aggregate([
  { $match: { severity: 3 } },
  { $lookup: { from: "mri_image", localField: "patient_id", foreignField: "patient_id", as: "images" } },
  { $unwind: "$images" },
  { $match: { "images.plane": "AXIAL" } }
])

// --- sort_memory: giới hạn 32MB, external sort, top-k, index (dùng cho slide 14) ---
db.report.createIndex({ patient_id: 1 })
// 14a. Sort trên field của bảng join, không cho dùng đĩa → lỗi 32MB (minh chứng)
db.mri_image.explain("executionStats").aggregate([
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } },
  { $sort: { "rep.severity": -1, slice_location: 1 } }
], { allowDiskUse: false })  // Atlas M0 → QueryExceededMemoryLimitNoDiskUseAllowed (expected)

// 14b. Cho dùng đĩa → explain thấy spilled to disk (~93MB), nhưng chạy thật trên M0 vẫn lỗi (M0 bỏ qua allowDiskUse)
db.mri_image.explain("executionStats").aggregate([
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } },
  { $sort: { "rep.severity": -1, slice_location: 1 } }
], { allowDiskUse: true })
// → nhìn: stages có totalDataSizeSortedBytesEstimate ~93MB, usedDisk: true

// 14c. Chạy thật (không phải explain) trên M0 vẫn lỗi dù allowDiskUse:true — minh chứng giới hạn M0
try { db.mri_image.aggregate([
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } },
  { $sort: { "rep.severity": -1, slice_location: 1 } }
], { allowDiskUse: true }).next() } catch(e) { print(e.message) }

// 14d. Đẩy $project xuống trước sort → row nhỏ hơn → vừa 32MB (không cần đĩa)
db.mri_image.explain("executionStats").aggregate([
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } },
  { $project: { patient_id: 1, slice_location: 1, "rep.severity": 1 } },
  { $sort: { "rep.severity": -1, slice_location: 1 } }
])

// 14e. Top-k: chỉ lấy 10 dòng → chỉ cần sort 10 dòng
db.mri_image.explain("executionStats").aggregate([
  { $lookup: { from: "report", localField: "patient_id", foreignField: "patient_id", as: "rep" } },
  { $sort: { "rep.severity": -1, slice_location: 1 } },
  { $limit: 10 }
])

// 14f/g. Sort bằng index thay vì SORT
db.mri_image.dropIndex("slice_location_1") // bỏ qua nếu chưa có
db.mri_image.find({}).sort({ slice_location: 1 }).limit(10).explain("executionStats") // → COLLSCAN + SORT
db.mri_image.createIndex({ slice_location: 1 })
db.mri_image.find({}).sort({ slice_location: 1 }).limit(10).explain("executionStats") // → IXSCAN, không có SORT, limit 10
db.mri_image.dropIndex("slice_location_1")


// ============================================================================
// EXTRA — ngoài đề xuất
// ============================================================================

// Regex vs text index
db.report.dropIndex("notes_text")
db.report.find({ clinician_notes: /stenosis/i }).explain("executionStats") // → COLLSCAN
db.report.createIndex({ clinician_notes: "text" }, { name: "notes_text" })
db.report.find({ $text: { $search: "stenosis" } }).explain("executionStats") // → TEXT + IXSCAN
db.report.find({ $text: { $search: "herniation" } }).explain("executionStats") // 77 kết quả (nhiều câu phủ định)
db.report.countDocuments({ findings: /hernia/i })  // chỉ 1 ca thật có herniation trong findings đã chuẩn hoá

// SBE vs classic + setQuerySettings (MongoDB 8.0, M0 sẽ lỗi expected)
db.mri_image.createIndex({ modality: 1, patient_id: 1, instance_number: 1 }, { name: "idx_ESR" })
db.mri_image.find({ modality: "T1" }).explain("executionStats").explainVersion // "1" = classic
db.mri_image.explain("executionStats").aggregate([
  { $match: { modality: { $ne: null } } },
  { $group: { _id: { modality: "$modality", plane: "$plane" }, n: { $sum: 1 } } }
]).explainVersion // "2" = SBE
try { db.adminCommand({ setQuerySettings: { find: "mri_image", filter: { modality: "T2" }, $db: "mri_demo" }, settings: { indexHints: { ns: { db: "mri_demo", coll: "mri_image" }, allowedIndexes: ["idx_ESR"] } } }) } catch(e) { print(e.codeName + ": " + e.message) }
try { db.adminCommand({ removeQuerySettings: { find: "mri_image", filter: { modality: "T2" }, $db: "mri_demo" } }) } catch(e) {}


// ============================================================================
// CLEANUP — xoá index demo, không xoá data
// ============================================================================
db.mri_image.dropIndexes()
db.report.dropIndexes()
try { db.adminCommand({ removeQuerySettings: { find: "mri_image", filter: { modality: "T2" }, $db: "mri_demo" } }) } catch(e) {}
db.mri_image.getIndexes()
db.report.getIndexes()
