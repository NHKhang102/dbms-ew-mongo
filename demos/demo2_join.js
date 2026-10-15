// Live demo 2 (proposal A.3 "Mạch 2"): joins with $lookup — J1 nested loop, J2 index loop, J4 hash join
(() => {
  requireData();
  banner({
    part: "MONGODB QUERY OPTIMIZATION · LIVE DEMO 2 of 3",
    title: "Joins with $lookup: nested loop (J1) → index loop (J2) → hash join (J4)",
    proposal: "A.3 \"Mạch 2\" · slides 14, 16–17",
    chapter: "Section 4, join algorithms J1–J4 · Section 9, join cost functions CJ1–CJ4",
    watch: "the join strategy MongoDB reports, and how many documents it has to examine"
  });
  const lk = { $lookup: { from: I_NAME, localField: "patient_id", foreignField: "patient_id", as: "images" } };
  const mT2 = { $match: { "images.modality": "T2" } };

  section("Part A · report ⋈ mri_image — the exact pipeline of proposal A.3");
  print("Question: which radiology reports have at least one T2 slice?");
  // Limit the outer side for the unindexed join, otherwise every report rescans all slices (very slow)
  const outer = report.find({}, { patient_id: 1 }).sort({ patient_id: 1 }).limit(OUTER_SMALL).toArray();
  const mSmall = { $match: { patient_id: { $lte: outer[outer.length - 1].patient_id } } };

  dropIndexesOnField(images, "patient_id");
  step("2a", "No index on the join field → nested-loop join (first " + outer.length + " reports only)",
       aggQ(report, [mSmall, lk, mT2]), {
    runs: 1,
    concept: "J1 nested-loop join: each outer report rescans every slice of " + I_NAME,
    note: "Documents examined ≈ outer rows × size of " + I_NAME + ". This is why only " + outer.length + " reports are used here."
  });
  if (FULL_NLJ)
    step("2a'", "No index, all reports (slow, exactly as in A.3)", aggQ(report, [lk, mT2]), { runs: 1, concept: "J1 nested-loop join" });
  ensureIndex(images, { patient_id: 1 }, "patient_id_1");
  step("2b", "Index on " + I_NAME + ".patient_id → index loop join (same " + outer.length + " reports)",
       aggQ(report, [mSmall, lk, mT2]), {
    concept: "J2 single-loop join: one index probe per outer report",
    note: "Same query as 2a. Only the index was added — compare documents examined and server time."
  });
  step("2c", "Index loop join on all reports", aggQ(report, [lk, mT2]), {
    concept: "J2 single-loop join at full size"
  });

  section("Part B · mri_image ⋈ report — the inner side is small (575 docs), so a hash join is possible");
  print("Question: for the first slice of every T2 series, attach the patient's radiology report.");
  const lkR = { $lookup: { from: R_NAME, localField: "patient_id", foreignField: "patient_id", as: "rep" } };
  const outer2 = { $match: { modality: "T2", instance_number: 1 } };
  dropIndexesOnField(report, "patient_id");
  step("2d", "No index, allowDiskUse: true → hash join", aggQ(images, [outer2, lkR], { allowDiskUse: true }), {
    concept: "J4 hash join — available for $lookup since the slot-based engine (MongoDB 6.0+)",
    note: "MongoDB builds a hash table on the small " + R_NAME + " collection. It picks hash join only when\n" +
          "no index on the foreign field is usable, the foreign collection is small (≤ 10,000 docs, ≤ 100 MB)\n" +
          "and allowDiskUse is permitted."
  });
  step("2e", "Same join, allowDiskUse: false → back to nested loop", aggQ(images, [outer2, lkR], { allowDiskUse: false }), {
    concept: "J1 nested-loop join",
    note: "Without permission to spill, the hash join is ruled out. Compare documents examined with 2d."
  });
  ensureIndex(report, { patient_id: 1 }, "patient_id_1");
  step("2f", "Index on " + R_NAME + ".patient_id → index loop join", aggQ(images, [outer2, lkR], { allowDiskUse: true }), {
    concept: "J2 single-loop join",
    note: "When an index exists MongoDB prefers it over the hash join (a fixed rule, not a cost comparison)."
  });

  takeaway([
    "MongoDB 8.0 runs $lookup with J1 (NestedLoopJoin), J2 (IndexedLoopJoin) or J4 (HashJoin). There is no J3 sort-merge join.",
    "The choice follows rules (usable index? small foreign side? disk use allowed?), not PostgreSQL-style cost functions CJ1–CJ4.",
    "Same lesson as Chapter 3: an index on the join column turns J1 into J2 and removes almost all of the work."
  ]);
  summary();
})();
