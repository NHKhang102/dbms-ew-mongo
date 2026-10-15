// Compound index demo: ESR rule (S7/S8) + covered query (≈ Index-Only Scan) — used for slide 11, E4(c)
(() => {
  requireData();
  banner({
    part: "MONGODB QUERY OPTIMIZATION · COMPOUND INDEX",
    title: "Compound indexes: the ESR rule (Equality → Sort → Range) and covered queries",
    proposal: "E4(c) · table A.0 rows S2 (Index-Only Scan) and S7/S8 (composite index) — supporting evidence for slide 11",
    chapter: "Section 4: S7/S8 conjunctive selection with a composite index · S2-like reading of an ordered index",
    watch: "whether a SORT stage is still needed, and \"documents examined\" dropping to 0 for a covered query"
  });

  section("Part 1 · Field order in a compound index");
  print("Query: the first 20 T2 slices with instance_number ≤ 3, ordered by patient_id.");
  print("  E (equality) = modality · S (sort) = patient_id · R (range) = instance_number");
  resetIndexes(images);
  const q = o => findQ(images, Q_ESR, Object.assign({ sort: S_ESR, limit: 20 }, o || {}));
  step("11a", "No index → full scan, then sort in memory", q(), {
    concept: "S1 linear search + in-memory sort"
  });
  IDX_ESR.forEach(x => ensureIndex(images, x[1], x[0]));
  step("11b", "Index in R-E-S order { instance_number, modality, patient_id }", q({ hint: "idx_RES" }), {
    concept: "Range field first: the index order does not match the sort",
    note: "The range on instance_number comes first, so entries are not ordered by patient_id → SORT is still needed."
  });
  step("11c", "Index in E-R-S order { modality, instance_number, patient_id }", q({ hint: "idx_ERS" }), {
    concept: "Range before the sort field: the order is broken again",
    note: "Within modality = T2, entries are ordered by instance_number first, so patient_id order is lost → SORT."
  });
  step("11d", "Index in E-S-R order { modality, patient_id, instance_number }", q({ hint: "idx_ESR" }), {
    concept: "ESR rule: the index already returns rows in patient_id order",
    note: "No SORT stage; the scan stops as soon as LIMIT has 20 rows (look at index keys examined)."
  });

  section("Part 2 · Covered query: answer from the index alone (≈ PostgreSQL Index-Only Scan)");
  const proj = { _id: 0, modality: 1, patient_id: 1, instance_number: 1 };
  step("11e", "Project only fields stored in the index", findQ(images, Q_ESR, { proj: proj, hint: "idx_ESR" }), {
    concept: "Covered query: PROJECTION_COVERED, 0 documents read"
  });
  step("11f", "Add file_path to the projection", findQ(images, Q_ESR, { proj: Object.assign({ file_path: 1 }, proj), hint: "idx_ESR" }), {
    concept: "Not covered any more",
    note: "file_path is not in the index, so every match needs a FETCH of the full document."
  });
  const withLv = report.findOne({ "levels.0": { $exists: true } }, { levels: 1 });
  if (withLv) {
    ensureIndex(report, { levels: 1 }, "levels_1");
    step("11g", "Index on the array field " + R_NAME + ".levels", findQ(report, { levels: withLv.levels[0] }, { proj: { _id: 0, levels: 1 } }), {
      concept: "Multikey index limitation",
      note: "One index entry per array element: the index cannot rebuild the whole array, so the query cannot be covered."
    });
  }

  takeaway([
    "In a compound index put Equality fields first, then the Sort field, then Range fields (ESR) — the index then replaces the sort.",
    "A covered query reads only the index (0 documents examined), MongoDB's counterpart of PostgreSQL's Index-Only Scan.",
    "Array (multikey) indexes can filter but never cover."
  ]);
  summary();
})();
