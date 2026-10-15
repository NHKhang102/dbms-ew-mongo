# MongoDB Demo — Slide Deck & Speaker Script

> **Language:** English  
> **Topic:** Query Processing & Optimization — MongoDB side  
> **Data:** Two Mendeley datasets on Atlas M0 (MongoDB 8.0.34)  
> **Target duration for MongoDB section:** ~8–10 minutes total  
> *(adjust per your overall time budget; the 3 live demos alone fit in ~2.5 min)*

---

## How to use this file

Each **SLIDE** block below = one presentation slide.  
For each slide you get:

| Field | Purpose |
|---|---|
| **Title** | Slide heading |
| **Screenshot** | What to screenshot — the exact command + output region |
| **On-slide text** | Bullet points / keywords to put on the slide |
| **Speaker script** | What to say while the slide is shown (read time ≈ shown in parentheses) |

📸 = take a screenshot of this terminal output  
🎤 = speaker script  
⏱ = approximate speaking time

---

# PHASE 0 — SETUP & DATA VERIFICATION

---

## SLIDE 0-1 ▸ Import & Environment

**Title:** `Data Setup — Two Mendeley Datasets on MongoDB Atlas`

**Screenshot:**  
📸 Atlas UI showing the `mri_demo` database with 2 collections visible, or the terminal after running:
```
./run.sh check_data
```
Capture the top section:
```
════════════════════════════════════════════════
 CONNECTION & DATA CHECK
════════════════════════════════════════════════
  Server     : MongoDB 8.0.34 · database mri_demo
  Purpose    : confirm the demos run on the two required Mendeley datasets only

Collections in mri_demo:
  - mri_image: 48,345 documents
  - report: 575 documents
```

**On-slide text:**
- **Database:** `mri_demo` on MongoDB Atlas (M0 free tier, v8.0.34)
- **Collection `report`:** 575 radiology notes (Mendeley dataset s6bgczr8s2)
- **Collection `mri_image`:** 48,345 DICOM slice headers (Mendeley dataset k57fr854j2)
- **Join key:** `patient_id` (numeric, present in both collections)
- Imported via `mongoimport` — no synthetic data

**🎤 Speaker script (~25s):**
> "Before we start the demo, let me show the setup. We have two collections on MongoDB Atlas — the same two Mendeley datasets required by the project. Collection `report` has 575 radiology notes, and `mri_image` has 48,345 DICOM slice headers. Both share a `patient_id` field that we'll use as the join key. The data is already imported — let's verify it."

---

## SLIDE 0-2 ▸ Data Verification

**Title:** `Data Check — All Fields Present, Join Key Works`

**Screenshot:**  
📸 Terminal output of `./run.sh check_data` — capture the **Checks** section:
```
Checks:
  ✔ report: 575 radiology notes (complete dataset s6bgczr8s2)
  ✔ mri_image: 48,345 DICOM slices (complete dataset k57fr854j2)
  ✔ report: original notes + derived query fields present
  ✔ mri_image: DICOM header fields present
  ✔ patient_id is numeric in both collections
  ✔ modality includes T1 and T2: [null, "PD", "T1", "T2"]
  ✔ plane includes SAGITTAL and AXIAL: [null, "AXIAL", "CORONAL", "SAGITTAL"]
  ✔ reports with matching images: 515 / 575 (the join key works)

RESULT: ✔ the data matches the team guide — the demos can run.
```

**On-slide text:**
- All 7 checks passed ✔
- 515 out of 575 reports have matching images → join key is valid
- **Key fields:** `patient_id`, `modality`, `plane`, `clinician_notes`, `severity`, `findings`
- Storage: ~18 MB data + ~3 MB indexes

**🎤 Speaker script (~20s):**
> "The check_data script verifies everything: correct document counts, required fields present, and — critically — that the join key `patient_id` actually links the two collections. 515 out of 575 reports have matching images. All checks pass, so the data is ready."

---

## SLIDE 0-3 ▸ Sample Documents

**Title:** `Sample Documents — report & mri_image`

**Screenshot:**  
📸 The sample documents from `check_data` output:
```json
// report
{
  patient_id: 1,
  clinician_notes: 'L4-5: degenerative annular disc bulge …',
  levels: ['L4-L5'],
  findings: ['disc_bulge', 'annular_tear', 'degenerative_change'],
  severity: 2,
  has_note: true
}
// mri_image
{
  patient_id: 1,
  modality: 'T1',
  plane: 'SAGITTAL',
  instance_number: 1,
  slice_location: -12,
  file_path: '0001/L-SPINE_LSS_…/LOCALIZER_0_0001_001.ima'
}
```

**On-slide text:**
- `report`: clinician notes, findings (NLP-extracted), severity score
- `mri_image`: DICOM metadata — modality (T1/T2), plane, slice location
- Linked by `patient_id` (integer)

**🎤 Speaker script (~15s):**
> "Here are sample documents. A report contains the radiologist's free-text notes plus structured fields we derived — findings and severity. An image record has the DICOM header fields: modality, plane, slice location. Both share patient_id."

---

## SLIDE 0-4 ▸ Reset / Cleanup

**Title:** `Reset — Drop All Demo Indexes`

**Screenshot:**  
📸 Terminal output of `./run.sh cleanup`:
```
 CLEAN-UP: drop demo indexes
  Before  : mri_image: _id_, patient_id_1
             report: _id_
  ▸ setup: db.mri_image.dropIndexes()   // only the _id index is left
  ▸ setup: db.report.dropIndexes()      // only the _id index is left
  After   : mri_image: _id_
             report: _id_
```

**On-slide text:**
- `./run.sh cleanup` → drops **all** indexes except `_id`
- Both collections now have only the default `_id` index
- Starting state = "no optimization" → demonstrates the impact of each technique
- ⚠ Scripts only create/drop indexes — **no documents are ever modified**

**🎤 Speaker script (~15s):**
> "Before each demo run, we reset both collections to their default state — only the `_id` index remains. This way every optimization technique starts from a clean baseline. Note: the scripts never modify the actual data."

---

# PHASE 1 — DEMO 1: SELECTION (S1 → S6/S8)

> **Chapter 3 concept:** Selection algorithms — S1 linear search → S6/S8 B+-tree index scan  
> **Proposal:** A.3 "Mạch 1"

---

## SLIDE 1-1 ▸ Demo 1 Introduction

**Title:** `Demo 1 — Selection: Linear Scan vs B+-tree Index`

**On-slide text:**
- **Question:** "Which T2-weighted MRI slices belong to patient 1?"
- **Filter:** `{ patient_id: 1, modality: "T2" }`
- **Chapter 3 mapping:** S1 (linear search) → S6/S8 (secondary B+-tree / composite index)
- **Watch for:** Plan changes from `COLLSCAN` → `IXSCAN`, documents examined drops to 1 per result

**🎤 Speaker script (~10s):**
> "Demo 1 is about selection. We ask: 'which T2 slices belong to patient 1?' — first without any index, then with a compound B+-tree index."

---

## SLIDE 1-2 ▸ Step 1a — No Index (COLLSCAN)

**Title:** `Step 1a — No Index → COLLSCAN (S1 Linear Search)`

**Screenshot:**  
📸 Run in `./run.sh shell`:
```js
show(db.mri_image, { patient_id: 1, modality: "T2" })
```
Capture the output focusing on:
```
Plan       : COLLSCAN  [out 30 · docs 48,345]
               filter: { $and: [{ patient_id: … }, { modality: … }] }
Result     : 30 returned · 0 index keys + 48,345 documents examined
             → documents examined per result: 1,611.5
```

**On-slide text:**
- **Plan:** `COLLSCAN` = full collection scan = **S1 linear search**
- **Result:** 30 returned, but **48,345 documents examined**
- **Docs per result:** 1,611 — scanned the entire collection for 30 matches
- No index → only one possible plan

**🎤 Speaker script (~20s):**
> "Without any index, MongoDB has exactly one option: COLLSCAN — a full collection scan. That's S1, the linear search from Chapter 3. It reads all 48,345 slices just to find 30. The ratio is over 1,600 documents examined per result — extremely inefficient."

---

## SLIDE 1-3 ▸ Step 1b — With Compound Index (IXSCAN)

**Title:** `Step 1b — Compound Index → IXSCAN (S6/S8 B+-tree)`

**Screenshot:**  
📸 Run:
```js
db.mri_image.createIndex({ patient_id: 1, modality: 1 })
show(db.mri_image, { patient_id: 1, modality: "T2" })
```
Capture:
```
Plan       : FETCH
               └ IXSCAN pid_mod { patient_id: 1, modality: 1 }
                   bounds: patient_id [1, 1] · modality ["T2", "T2"]
Result     : 30 returned · 30 index keys + 30 documents examined
             → documents examined per result: 1
```

**On-slide text:**
- **Index created:** `{ patient_id: 1, modality: 1 }` — compound B+-tree
- **Plan:** `IXSCAN` → `FETCH` = **S6/S8 composite index scan**
- Both conditions become **index bounds** → only matching entries touched
- **Result:** 30 returned, **30 docs examined** — ratio drops to **1**
- 📊 **48,345 → 30** documents examined

**🎤 Speaker script (~20s):**
> "Now we add a compound index on patient_id and modality. The plan changes to IXSCAN — that's S6 and S8 from Chapter 3. Both equality conditions become index bounds, so the server only touches exactly 30 documents. Documents examined per result drops from 1,611 to 1. Same query, same data, completely different performance."

---

## SLIDE 1-4 ▸ Step 1c — Primary Key Lookup (_id)

**Title:** `Step 1c — Lookup by _id (S3 Primary Key)`

**Screenshot:**  
📸 Run step 1c from the demo — capture the plan showing:
```
Plan       : EXPRESS_IXSCAN
Result     : 1 returned · 1 index key + 1 document examined
             → documents examined per result: 1
```

**On-slide text:**
- **S3 primary key:** `_id` lookup skips query planning entirely
- MongoDB 8.0 "express path" — no candidate plans, no race
- **1 key, 1 document** — the fastest possible access path

**🎤 Speaker script (~10s):**
> "Looking up by `_id` is S3 — the primary key path. MongoDB 8.0 has an 'express path' that skips the planner entirely. One key, one document, zero overhead."

---

## SLIDE 1-5 ▸ Steps 1d/1e — No Cost Model

**Title:** `Steps 1d–1e — MongoDB Has No Cost-Based Optimizer`

**Screenshot:**  
📸 Run steps 1d and 1e — capture side by side or stacked:
```
Step 1d: filter { patient_id: { $gte: 1 } }   → IXSCAN (uses the index!)
Step 1e: same filter + hint({ $natural: 1 })   → COLLSCAN (forced full scan)
```
Highlight the server time: 1e (COLLSCAN) is often *faster* than 1d (IXSCAN).

**On-slide text:**
- **1d:** Low-selectivity filter (`patient_id ≥ 1` matches ~all docs) → MongoDB **still picks IXSCAN**
- **1e:** Force a COLLSCAN with `hint({ $natural: 1 })` → often **faster**
- **Key insight:** MongoDB chooses plans by available indexes, **not by estimated cost**
- PostgreSQL's cost-based planner would choose Seq Scan here
- **Difference:** no `pg_statistic`, no histograms, no cost estimation

**🎤 Speaker script (~20s):**
> "This is where MongoDB differs from PostgreSQL. The filter matches almost every document, so a full scan should be cheaper. But MongoDB still picks the index — because one exists. If we force a COLLSCAN with a hint, it's actually faster. MongoDB doesn't estimate cost from statistics like PostgreSQL does. It picks plans based on available indexes and a trial race."

---

## SLIDE 1-6 ▸ Demo 1 Summary

**Title:** `Demo 1 Summary — Selection`

**On-slide text:**

| | No Index (1a) | Compound Index (1b) |
|---|---|---|
| **Plan** | COLLSCAN | IXSCAN |
| **Docs examined** | 48,345 | 30 |
| **Docs / result** | 1,611 | 1 |
| **Concept** | Linear search | B+-tree index scan |

- ✅ Same Chapter 3 concepts in both PostgreSQL and MongoDB
- ⚠ MongoDB: no cost-based optimizer — uses index rules + trial race

**🎤 Speaker script (~10s):**
> "Demo 1 takeaway: the same Chapter 3 idea applies — going from S1 linear scan to S6/S8 index scan reduces work by over 99%. The difference is that MongoDB chooses the plan by index availability, not by cost estimation."

---

# PHASE 2 — DEMO 2: JOINS (J1 → J2 → J4)

> **Chapter 3 concept:** Join algorithms — J1 nested loop, J2 indexed loop, J4 hash join  
> **Proposal:** A.3 "Mạch 2"

---

## SLIDE 2-1 ▸ Demo 2 Introduction

**Title:** `Demo 2 — Join Algorithms via $lookup`

**On-slide text:**
- **Question:** "Which radiology reports have at least one T2 slice?"
- **Pipeline:** `report` → `$lookup` → `mri_image` on `patient_id`
- **Chapter 3 mapping:** J1 → J2 → J4 (no J3 sort-merge in MongoDB)
- **Watch for:** join strategy name and documents examined count

**🎤 Speaker script (~10s):**
> "Demo 2 is about joins. We use MongoDB's `$lookup` to join reports with images. We'll see three join strategies: nested loop J1, indexed loop J2, and hash join J4."

---

## SLIDE 2-2 ▸ Step 2a — Nested Loop Join (J1)

**Title:** `Step 2a — No Join Index → Nested Loop Join (J1)`

**Screenshot:**  
📸 Run step 2a — capture:
```
Plan       : EQ_LOOKUP from mri_image on patient_id = patient_id · NestedLoopJoin
               └ COLLSCAN on report (575 docs examined)
Join       : NestedLoopJoin = Chapter 3 J1 nested-loop
Result     : 10 returned · 0 index keys + 484,025 documents examined
             → documents examined per result: 48,403 · ~205 ms
```

**On-slide text:**
- **Join:** `NestedLoopJoin` = **J1** — each outer report rescans **all** slices
- Only 10 reports used (full set would scan ~28M docs)
- **484,025 docs examined** for 10 results → ratio **48,403**
- Cost ≈ outer COLLSCAN + (outer rows × inner size) = 575 + (10 × 48,345) = **484,025 docs**
- 11 collection scans (1 outer + 10 inner scans) · ~205 ms for just 10 rows

**🎤 Speaker script (~20s):**
> "Without an index on the join field, MongoDB uses NestedLoopJoin — that's J1 from Chapter 3. Both collections start clean with no secondary indexes. For each of the 10 matched reports, MongoDB rescans all 48,345 slices. In total, over 484,000 documents are examined for just 10 results. That's why we limit it to 10 — the full 575 reports would scan 28 million."

---

## SLIDE 2-3 ▸ Step 2b — Indexed Loop Join (J2)

**Title:** `Step 2b — Index on Join Field → Indexed Loop Join (J2)`

**Screenshot:**  
📸 Run step 2b — capture:
```
  ▸ setup: db.mri_image.createIndex({ patient_id: 1 })

Plan       : EQ_LOOKUP from mri_image on patient_id = patient_id · IndexedLoopJoin
               └ index: patient_id_1 (10 index seeks)
Join       : IndexedLoopJoin = Chapter 3 J2 single-loop (index)
Result     : 10 returned · 734 index keys + 1,309 documents examined
             → server time: 4 ms
```

**On-slide text:**
- **One line changed:** `db.mri_image.createIndex({ patient_id: 1 })`
- **Join:** `IndexedLoopJoin` = **J2** — one index probe (`indexSeeks: 10`) per outer report
- **Inner image reads:** drops from **483,450 → 734 docs** (**658× fewer!**)
- **Total docs examined:** drops from **484,025 → 1,309 docs** (575 outer + 734 inner)
- **4 ms** (was ~210 ms) → **~50× faster**
- Same query, same data — only the index was added

**🎤 Speaker script (~20s):**
> "Now we add an index on patient_id. Same query, same 10 reports. The join strategy immediately switches to IndexedLoopJoin — that's J2. Instead of scanning all 48,000 images ten times, MongoDB does just 10 index seeks. Inner document reads drop from 483,000 to just 734 slices — a 658-fold reduction. Execution time plummets from 210ms to just 4ms."

---

## SLIDE 2-4 ▸ Step 2c — Indexed Loop Join at Full Scale (All 575 Reports)

**Title:** `Step 2c — Full-Scale Join (575 Reports ⋈ 48,345 Slices)`

**Screenshot:**  
📸 Chèn ảnh chụp màn hình Compass Visual Tree (EQ_LOOKUP + COLLSCAN, Performance Summary):
```
Visual Tree: EQ_LOOKUP (79 ms) ← COLLSCAN (575 docs)
Performance: 515 documents returned
             48,920 documents examined (575 outer + 48,345 inner)
             48,345 index keys examined
             178 ms execution time
```

**On-slide text:**
- **Join at full scale:** joining all 575 radiology reports with 48,345 MRI slices
- **Without index (2a hypothetical):** would examine $575 \times 48,345 \approx$ **27.8 MILLION documents** (server timeout / freeze)
- **With index (2c actual):** examines only **48,920 documents** ($575 \text{ outer} + 48,345 \text{ inner}$)
- **48,345 index keys examined** via B-tree probe
- **515 reports returned** (matches 60 empty reports: $575 - 60 = 515$)
- **Execution time:** only **178 ms** for the entire database!

**🎤 Speaker script (~20s):**
> "In Step 2c, we remove the 10-report limit and run the join across the entire database. Without an index, this nested loop would have scanned nearly 28 million documents and frozen our cluster. But with the index, MongoDB evaluates all 575 reports and 48,000 images examining just 48,920 documents, completing in only 178 milliseconds. 515 reports matched with T2 images, perfectly matching our data check."

---

## SLIDE 2-5 ▸ Step 2d — Hash Join (J4)

**Title:** `Step 2d — Hash Join (J4) — Small Inner Side`

**Screenshot:**  
📸 Run step 2d (reversed direction: mri_image ⋈ report) — capture:
```
Plan       : EQ_LOOKUP from report on patient_id = patient_id · HashJoin
               └ COLLSCAN   filter: { modality: "T2", instance_number: 1 }
Join       : HashJoin = Chapter 3 J4 hash join
Result     : 1,389 returned · 0 index keys + 48,920 documents examined
             → documents examined per result: 35.2 · 32 ms
```

**On-slide text:**
- **Conditions for hash join:** no index on foreign field + small inner side (≤ 10K docs, ≤ 100 MB) + `allowDiskUse: true`
- MongoDB builds a **hash table** on `report` (575 docs)
- **J4 hash join** — available since SBE (MongoDB 6.0+)
- ⚠ `allowDiskUse: false` → falls back to J1 NestedLoopJoin (847,020 docs, 362 ms)
- **No J3 sort-merge join** in MongoDB

**🎤 Speaker script (~20s):**
> "When the inner side is small — 575 reports — and there's no index, MongoDB can use a hash join. It builds a hash table on the report collection. This is J4 from Chapter 3. Notice: if we turn off allowDiskUse, it falls back to nested loop with 847,000 docs examined. Also important: MongoDB has no sort-merge join — no J3."

---

## SLIDE 2-6 ▸ Demo 2 Summary

**Title:** `Demo 2 Summary — Join Algorithms`

**On-slide text:**

| Step | Join | Scale | Docs Examined | Server Time | Ch.3 |
|---|---|---|---|---|---|
| 2a (no index) | NestedLoopJoin | 10 reports | 484,025 | ~210 ms | J1 |
| 2b (index) | IndexedLoopJoin | 10 reports | 1,309 | 4 ms | J2 |
| 2c (index, full) | IndexedLoopJoin | **All 575 reports** | **48,920** | **178 ms** | J2 |
| 2d (hash) | HashJoin | Reversed | 48,920 | 32 ms | J4 |
| 2e (no disk) | NestedLoopJoin | Reversed | 847,020 | 362 ms | J1 |

- MongoDB picks join strategy by **rules** (index? small? disk?), **not** by cost functions CJ1–CJ4
- J3 sort-merge join does **not exist** in MongoDB

**🎤 Speaker script (~15s):**
> "The summary table shows the dramatic impact. J1 to J2 is a 650x reduction in inner documents examined. With index, even the full 575-report join finishes in 178ms. MongoDB picks the join strategy by rules — is there an index? Is the inner side small? Is disk use allowed? — not by cost estimation like PostgreSQL."

---

# PHASE 3 — DEMO 3: HEURISTIC OPTIMIZATION (σ below ⋈)

> **Chapter 3 concept:** Section 8, heuristic optimization — transformation rule #6  
> **Proposal:** A.3 "Mạch 3"

---

## SLIDE 3-1 ▸ Demo 3 Introduction

**Title:** `Demo 3 — Heuristic Optimization: Push σ Below ⋈`

**On-slide text:**
- **Chapter 3 rule #6:** Push selection (σ) below join (⋈) when possible
- Write the pipeline "badly" ($lookup first, $match last) vs "well" ($match first)
- **Hypothesis:** MongoDB's optimizer should rewrite both to the same plan
- **Watch for:** `"As written"` vs `"Runs as"` and `"✔ SAME PLAN"`

**🎤 Speaker script (~10s):**
> "Demo 3 tests heuristic optimization. Chapter 3's rule 6 says: push the selection below the join. We write the same query two ways — filter after join, and filter before join — and check if MongoDB produces the same plan."

---

## SLIDE 3-2 ▸ Step 3a — $match After $lookup (Bad Order)

**Title:** `Step 3a — Written Badly: $lookup → $match`

**Screenshot:**  
📸 Run step 3a — capture:
```
Query      : db.mri_image.aggregate([
               { $lookup: { from: "report", …, as: "rep" } },
               { $match: { modality: "T2", instance_number: 1 } }
             ])
Pushed down: { $and: [{ instance_number: { $eq: 1 } }, { modality: { $eq: "T2" } }] }
As written : $lookup → $match
Runs as    : IXSCAN → FETCH → EQ_LOOKUP   (after optimization)
```

**On-slide text:**
- **As written:** `$lookup → $match` (join ALL slices, filter afterwards)
- **Runs as:** `IXSCAN → FETCH → EQ_LOOKUP` — filter moved **before** the join!
- **Pushed down:** filter becomes an index scan condition
- Optimizer applied **rule #6** automatically

**🎤 Speaker script (~15s):**
> "We write it 'badly' — lookup first, then match. But look at the 'Runs as' line: the optimizer moved the match before the lookup. The filter is even pushed down into an index scan. MongoDB applied rule 6 automatically."

---

## SLIDE 3-3 ▸ Step 3b — $match Before $lookup (Good Order) + SAME PLAN

**Title:** `Steps 3a vs 3b — ✔ SAME PLAN`

**Screenshot:**  
📸 Run step 3b and `compareLast()` — capture:
```
Step 3b · Written well: $match first, then $lookup
  As written : $match → $lookup
  Runs as    : IXSCAN → FETCH → EQ_LOOKUP   (after optimization)
  Result     : 1,389 returned · 3,293 keys + 2,778 docs · 28 ms

Plan check 3a vs 3b: ✔ SAME PLAN
```

**On-slide text:**
- **3a** (bad order) → same plan as **3b** (good order)
- **✔ SAME PLAN** — optimizer rewrites 3a into 3b
- Both: 1,389 returned, 3,293 keys, 2,778 docs examined
- The user **does not need to hand-optimize** the pipeline order
- PostgreSQL does the same with WHERE clauses

**🎤 Speaker script (~20s):**
> "And here's the proof: when we write it properly — match first, then lookup — the plan is identical. The compareLast function confirms: SAME PLAN. The optimizer applied Chapter 3's rule 6 transparently. PostgreSQL does exactly the same thing with WHERE clauses — the user doesn't have to worry about the order."

---

## SLIDE 3-4 ▸ Demo 3 Summary

**Title:** `Demo 3 Summary — Heuristic Rewrite`

**On-slide text:**

| Pair | Written | Optimizer Rewrites To | Plan | Result |
|---|---|---|---|---|
| 3a vs 3b | `$lookup → $match` vs `$match → $lookup` | Same: `IXSCAN → FETCH → EQ_LOOKUP` | ✔ SAME PLAN | 1,389 rows |
| 3c vs 3d | `$lookup → $match { severity: 3 }` vs reversed | Same: `COLLSCAN → EQ_LOOKUP` | ✔ SAME PLAN | 62 rows |

- MongoDB's aggregation optimizer uses Chapter 3 heuristic rules
- Filter pushed into the scan stage → join only sees matching rows
- Works the same way as PostgreSQL's planner with WHERE pushdown

**🎤 Speaker script (~10s):**
> "Both pairs confirm: MongoDB applies heuristic rewrite rules from Chapter 3. The filter moves before the join, gets pushed into the scan, and the join only processes matching rows."

---

# PHASE 4 — SUPPLEMENTARY DEMOS

> These support slides 11–14 of the proposal. Include as time permits.

---

## SLIDE 4-1 ▸ Compound Index — ESR Rule (Slide 11)

**Title:** `Compound Index — Equality → Sort → Range (ESR Rule)`

**Screenshot:**  
📸 Run `./run.sh compound_index` — capture steps 11a–11d summary:
```
11a: No index         → COLLSCAN + in-memory SORT
11b: R-E-S order      → IXSCAN + SORT (still needs sort)
11c: E-R-S order      → IXSCAN + SORT (range breaks sort order)
11d: E-S-R order      → IXSCAN only, NO SORT stage
```

**On-slide text:**
- **ESR rule:** put **E**quality first, **S**ort second, **R**ange last in the compound index
- Wrong field order (11b, 11c) → index used but **SORT still needed**
- Correct ESR order (11d) → **no SORT stage**, scan stops at LIMIT
- **Covered query (11e):** project only indexed fields → **0 documents read** (≈ PostgreSQL Index-Only Scan)

**🎤 Speaker script (~25s):**
> "For compound indexes, field order matters enormously. The ESR rule says: equality fields first, then the sort field, then range. If you get it wrong — like putting range first — the index can filter but the server still has to sort in memory. With ESR order, the index already returns rows sorted, so the SORT stage disappears. And if you only project fields that are in the index, you get a covered query — zero document reads, like PostgreSQL's Index-Only Scan."

---

## SLIDE 4-2 ▸ Plan Cache & Trial Race (Slide 12)

**Title:** `Plan Selection — Trial Race, Not Cost Estimation`

**Screenshot:**  
📸 Run `./run.sh plan_cache` — capture step 12a (allPlansExecution) and 12b:
```
Step 12a: 3 candidate indexes → trial race
  #1 idx_ESR  returned 20 · keys 21 · docs 20 · works 22 · score 1.003
  #2 idx_ERS  returned 20 · keys 62 · docs 20 · works 63 · score 1.003
  #3 idx_RES  returned 20 · keys 158 · docs 20 · works 159 · score 1.003

Step 12b: Same query, different constants → same query shape
  shape hash 12a = … · shape hash 12b = …
  ✔ identical: cached winner of 12a is reused without a new race
```

**On-slide text:**
- **PostgreSQL:** cost-based — estimates cost from `pg_statistic` before execution
- **MongoDB:** empirical — **races** candidate plans for a short trial, picks winner by work units
- Winner is **cached per query shape** (constants are ignored)
- Later queries with different values skip the race (12b)
- No statistics tables, no histograms, no `ANALYZE`

**🎤 Speaker script (~25s):**
> "Here's a fundamental difference with PostgreSQL. PostgreSQL estimates plan cost from statistics before running anything. MongoDB has no cost model — it races the candidate plans. Each plan runs a short trial, and the one that returns the most results per unit of work wins. The winner is then cached for the query shape — so the same query with different constants reuses the cached plan without re-racing."

---

## SLIDE 4-3 ▸ Pipeline Rewrite Rules (Slide 13)

**Title:** `Pipeline Optimizer — Automatic Rewrite Rules`

**Screenshot:**  
📸 Run `./run.sh pipeline_rewrite` — capture 13a, 13b, 13c summaries:
```
13a: $addFields + $match → $match moved before $addFields (push σ below π)
13b: $sort + $limit      → combined into top-k sort (keeps only 5 in memory)
13c: $lookup + $unwind + $match → absorbed into a single join stage
```

**On-slide text:**
- **13a:** Push σ below computed projection — `$match` moved before `$addFields`
- **13b:** Combine sort + limit → **top-k sort** (memory holds only k rows)
- **13c:** `$lookup + $unwind + $match` → **single join stage** (no intermediate array)
- All based on Chapter 3 Section 8 heuristic optimization principles

**🎤 Speaker script (~20s):**
> "Beyond just pushing filters, MongoDB's pipeline optimizer applies several other rewrite rules. It pushes a match below a computed field if possible. It combines sort and limit into a top-k sort that only keeps 5 rows in memory. And it absorbs unwind and match into the lookup itself so no intermediate array is ever built."

---

## SLIDE 4-4 ▸ Sort & Memory Limits (Slide 14)

**Title:** `Sorting Under Memory Limits — External Sort & Workarounds`

**Screenshot:**  
📸 Run `./run.sh sort_memory` — capture steps 14a, 14b, 14d, 14g:
```
14a: Sort after join, no disk → ERROR: sort exceeds 32 MB memory limit
14b: allowDiskUse: true → external sort-merge (spilled ~94 MB to disk)
14d: $project first, then sort → fits in memory (smaller rows)
14g: Index on sort field → NO SORT stage (index provides order)
```

**On-slide text:**
- **32 MB sort limit** on Atlas M0 (100 MB self-hosted)
- **14a:** Error — sort data too large for in-memory buffer
- **14b:** External sort-merge (Chapter 3) — sorted runs spill to disk, then merge
- **Workarounds:**
  - **14d:** Push π down — project fewer fields → rows fit in memory
  - **14e:** Top-k sort — memory holds only k rows
  - **14g:** Index provides order → no SORT stage at all
- Same concept as PostgreSQL's `work_mem` overflow → temp files

**🎤 Speaker script (~25s):**
> "MongoDB has a 32 megabyte sort buffer on the free tier. When joined rows carry full clinical notes, the sort exceeds this limit. With allowDiskUse, MongoDB does an external sort-merge — the same algorithm from Chapter 3. But there are smarter workarounds: project only the fields you need to shrink the rows, use a top-k sort that only holds k rows, or create an index on the sort field so the sort stage disappears entirely. PostgreSQL faces the same trade-off with work_mem."

---

# PHASE 5 — EXTRA DEMOS (Optional)

> Not in the proposal — use if time permits or for Q&A backup

---

## SLIDE 5-1 ▸ Text Search — Regex vs Inverted Index

**Title:** `Extra — Text Search: Regex Scan vs Text Index`

**Screenshot:**  
📸 Run `./run.sh extra_text_search` — capture steps Ta and Tb:
```
Step Ta · Regex search for 'stenosis'
  Plan   : COLLSCAN   filter: { clinician_notes: /stenosis/i }
  Result : 17 returned · 575 documents examined

Step Tb · $text search with text index
  Plan   : IXSCAN → FETCH → TEXT_MATCH
  Result : 17 returned · 17 keys + 17 documents examined
```

**On-slide text:**
- **Regex:** case-insensitive → cannot use B-tree index → **COLLSCAN** (575 docs)
- **Text index:** inverted index (word → document list) → **17 docs** examined
- ⚠ Keyword matching ≠ semantic understanding:
  - `$text "herniation"` → 77 matches (many are "No evidence of herniation")
  - Actual herniation findings: only 1 report
- **Takeaway:** Pre-processing notes into structured fields is also query optimization

**🎤 Speaker script (~20s):**
> "A quick extra: searching clinical notes. A regex scan reads all 575 documents. A text index — an inverted index — finds the same 17 results by looking up only 17 entries. But keyword matching has a catch: searching 'herniation' returns 77 reports, but most say 'No evidence of herniation.' Only 1 report actually has that finding. This shows that pre-processing notes into structured fields is itself a form of query optimization."

---

## SLIDE 5-2 ▸ Classic Engine vs SBE

**Title:** `Extra — Classic Engine vs Slot-Based Engine (SBE)`

**Screenshot:**  
📸 Run `./run.sh extra_sbe` — capture steps Sa and Sb:
```
Step Sa · A plain find()
  Engine: classic engine · 2 candidate plans raced

Step Sb · $match + $group
  Engine: slot-based execution engine (SBE) · 2 candidate plans raced
```

**On-slide text:**
- MongoDB 8.0 runs **two engines side by side**
- **Classic engine:** simple `find()` queries
- **SBE (Slot-Based Engine):** `$group`, `$lookup`, complex pipelines — newer, faster
- `setQuerySettings` (8.0): pin index choice for a query shape without code changes
  - ⚠ Not available on Atlas M0 free tier
- The optimizer decides which engine to use

**🎤 Speaker script (~15s):**
> "MongoDB 8.0 actually runs two execution engines. Simple finds use the classic engine. Pipelines with group or lookup are pushed to the Slot-Based Engine — SBE — which is newer and faster. MongoDB 8.0 also introduced setQuerySettings to pin an index choice, though it's not available on the free tier."

---

# PHASE 6 — CLOSING

---

## SLIDE 6-1 ▸ Overall Summary Table

**Title:** `MongoDB Demo — Complete Summary`

**On-slide text:**

| Demo | Chapter 3 Concept | Before | After | Key Metric |
|---|---|---|---|---|
| **1 · Selection** | S1 → S6/S8 | COLLSCAN: 48,345 docs | IXSCAN: 30 docs | **1,600× → 1** docs/result |
| **2 · Join** | J1 → J2 (→ J4) | NLJ: 484,025 docs | ILJ: 1,309 docs | **370× reduction** (inner: 658×) |
| **3 · Heuristic** | Rule #6 (σ below ⋈) | $lookup → $match | Optimizer rewrites | **✔ SAME PLAN** |
| Compound idx | ESR rule, covered query | SORT in memory | No SORT, 0 doc reads | Index replaces sort |
| Plan cache | Trial race, no cost model | — | Cached per query shape | No pg_statistic |
| Pipeline rewrite | Heuristic rules | As written | Optimized | Transparent |
| Sort & memory | External sort-merge | 32 MB limit error | Disk spill / top-k / index | Same as work_mem |

**🎤 Speaker script (~15s):**
> "To wrap up: every demo shows a real Chapter 3 concept running inside MongoDB. Selection goes from linear scan to index scan. Joins go from nested loop to indexed loop and hash join. And the optimizer applies heuristic rewrite rules automatically. The key difference with PostgreSQL: MongoDB uses trial races instead of cost estimation."

---

## SLIDE 6-2 ▸ Key Differences MongoDB vs PostgreSQL

**Title:** `MongoDB vs PostgreSQL — Optimizer Comparison`

**On-slide text:**

| Aspect | PostgreSQL | MongoDB |
|---|---|---|
| **Plan selection** | Cost-based (pg_statistic, histograms) | Trial race (empirical, no stats) |
| **Join algorithms** | NLJ, Hash, Sort-Merge, Index NLJ | NLJ, Index Loop, Hash — **no sort-merge** |
| **Heuristic rules** | WHERE pushdown, join reordering | $match pushdown, pipeline rewrite |
| **Sort overflow** | work_mem → temp files | 32/100 MB buffer → external sort |
| **Execution engines** | 1 (executor) | 2 (classic + SBE) |
| **Plan hints** | pg_hint_plan (extension) | setQuerySettings (built-in 8.0) |

**🎤 Speaker script (~15s):**
> "The comparison table highlights the architectural differences. PostgreSQL relies on statistics and cost models. MongoDB uses empirical trials. PostgreSQL has sort-merge join — MongoDB doesn't. But both apply the same heuristic rewrite principles from Chapter 3. Both are real-world implementations of the theory."

---

# APPENDIX — QUICK REFERENCE

## Commands Cheat Sheet

```bash
# Verify data
./run.sh check_data

# Reset indexes to default
./run.sh cleanup

# Run all 3 live demos
./run.sh live

# Run all demos including supplementary
./run.sh all

# Run extra demos
./run.sh extra

# Interactive shell
./run.sh shell
```

## Screenshot Checklist

- [ ] Slide 0-1: check_data header (collections + counts)
- [ ] Slide 0-2: check_data checks section (all ✔)
- [ ] Slide 0-3: sample documents (report + mri_image)
- [ ] Slide 0-4: cleanup output (before → after)
- [ ] Slide 1-2: step 1a COLLSCAN output
- [ ] Slide 1-3: createIndex + step 1b IXSCAN output
- [ ] Slide 1-4: step 1c EXPRESS path
- [ ] Slide 1-5: steps 1d vs 1e comparison
- [ ] Slide 2-2: step 2a NLJ output
- [ ] Slide 2-3: step 2b ILJ output
- [ ] Slide 2-4: step 2c Full-scale ILJ output (Compass Visual Tree)
- [ ] Slide 2-5: step 2d HashJoin output
- [ ] Slide 3-2: step 3a "As written" vs "Runs as"
- [ ] Slide 3-3: step 3b + "✔ SAME PLAN"
- [ ] Slide 4-1: compound index ESR steps
- [ ] Slide 4-2: plan cache trial race
- [ ] Slide 4-3: pipeline rewrite rules
- [ ] Slide 4-4: sort memory limit + workarounds
- [ ] Slide 5-1: text search regex vs text index (optional)
- [ ] Slide 5-2: classic vs SBE engine (optional)

## Timing Budget

| Phase | Slides | Est. Time |
|---|---|---|
| Phase 0: Setup & Data | 0-1 to 0-4 | ~1:15 |
| Phase 1: Selection | 1-1 to 1-6 | ~1:30 |
| Phase 2: Joins | 2-1 to 2-6 | ~1:45 |
| Phase 3: Heuristic | 3-1 to 3-4 | ~0:55 |
| Phase 4: Supplementary | 4-1 to 4-4 | ~1:35 |
| Phase 5: Extras | 5-1 to 5-2 | ~0:35 |
| Phase 6: Closing | 6-1 to 6-2 | ~0:30 |
| **Total** | **~25 slides** | **~8:00** |

> **If time is tight:** Skip Phase 5 (extras) and compress Phase 4 (supplementary) by picking only 1–2 slides. The core Phases 1–3 + closing fit in **~4:30**.
>
> **If doing only the 3 live demos (slide 17 of proposal):** Use only Phases 1–3 = ~3:50 including intros, or ~2:30 script-only.
