// Live demo 1 (proposal A.3 "Mạch 1"): selection — S1 linear search → S6/S8 B+-tree index
(() => {
  requireData();
  banner({
    part: "MONGODB QUERY OPTIMIZATION · LIVE DEMO 1 of 3",
    title: "Selection: from linear search (S1) to a B+-tree index (S6/S8)",
    proposal: "A.3 \"Mạch 1\" · slides 16–17",
    chapter: "Section 4, selection algorithms: S1 linear search, S3 primary key, S6 secondary B+-tree, S8 composite index",
    watch: "the plan changing from COLLSCAN to IXSCAN, and \"documents examined per result\" dropping to 1"
  });
  const any = images.findOne({ modality: "T2" }, { patient_id: 1 });
  const P = any ? any.patient_id : images.findOne().patient_id;
  const Q = { patient_id: P, modality: "T2" };
  print("\nQuestion: which T2-weighted MRI slices belong to patient " + P + "?");
  print("(The proposal wrote patient_id 'P0123' on report; in the real data patient_id is a number and modality lives in " + I_NAME + ".)");

  section("Before: no index");
  resetIndexes(images);
  step("1a", "No index → full collection scan", findQ(images, Q), {
    concept: "S1 linear search (PostgreSQL: Seq Scan)",
    note: "With no index the optimizer has a single possible plan: read all slices and test each one."
  });

  section("After: one compound index");
  ensureIndex(images, { patient_id: 1, modality: 1 }, "pid_mod");
  step("1b", "Compound index on (patient_id, modality) → index range scan", findQ(images, Q), {
    concept: "S6 secondary B+-tree index + S8 composite index (PostgreSQL: Index Scan)",
    note: "Both equality conditions become index bounds, so only matching entries are touched."
  });
  const anyId = images.findOne({}, { _id: 1 })._id;
  step("1c", "Lookup by _id → primary-key fast path", findQ(images, { _id: anyId }), {
    concept: "S3 primary key · MongoDB 8.0 \"express path\" skips query planning entirely"
  });

  section("Where MongoDB differs from PostgreSQL: no cost model (supports slide 12)");
  step("1d", "Filter matching almost every slice (patient_id ≥ 1)", findQ(images, { patient_id: { $gte: 1 } }), {
    concept: "Plan choice without cost estimation",
    note: "MongoDB still uses the index because one exists: it never estimates that a full scan would be cheaper.\n" +
          "PostgreSQL's cost-based planner would choose Seq Scan for such a low-selectivity filter."
  });
  step("1e", "Same filter, full scan forced with hint({ $natural: 1 })",
       findQ(images, { patient_id: { $gte: 1 } }, { hint: { $natural: 1 } }), {
    concept: "Manual override of the optimizer",
    note: "Compare the server time with 1d: the scan the optimizer did not pick is usually faster here."
  });

  takeaway([
    "Same Chapter 3 idea in both DBMSs: S1 (Seq Scan / COLLSCAN) → S6/S8 (Index Scan / IXSCAN).",
    "\"Documents examined per result\" is the practical selectivity measure (proposal E4e): it falls to 1 with the index.",
    "MongoDB picks plans by available indexes, not by estimated cost — see 1d vs 1e."
  ]);
  summary();
})();
