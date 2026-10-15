// Live demo 3 (proposal A.3 "Mạch 3"): heuristic optimization — the optimizer pushes $match (σ) below $lookup (⋈)
(() => {
  requireData();
  banner({
    part: "MONGODB QUERY OPTIMIZATION · LIVE DEMO 3 of 3",
    title: "Heuristic optimization: pushing the selection ($match) below the join ($lookup)",
    proposal: "A.3 \"Mạch 3\" · slides 13, 16–17",
    chapter: "Section 8, heuristic optimization: transformation rule #6 (push σ below ⋈)",
    watch: "\"Pushed down\" and \"Runs as\": the badly written pipeline is executed exactly like the good one"
  });
  ensureIndex(images, { modality: 1, patient_id: 1, instance_number: 1 }, "idx_ESR");
  ensureIndex(images, { patient_id: 1 }, "patient_id_1");
  ensureIndex(report, { patient_id: 1 }, "patient_id_1");
  print("\nThe same question is written twice: once with the filter AFTER the join, once BEFORE it.");
  print("If the optimizer applies rule #6, both versions get the same plan.");
  print("(The proposal put $match {modality} after a $lookup on " + R_NAME + "; " + R_NAME +
        " has no modality field, so these examples start from " + I_NAME + " instead.)");

  section("Pair 1 · first slice of each T2 series, joined with its report");
  const lkR = { $lookup: { from: R_NAME, localField: "patient_id", foreignField: "patient_id", as: "rep" } };
  const m = { $match: { modality: "T2", instance_number: 1 } };
  const bad = step("3a", "Written badly: $lookup first, $match last", aggQ(images, [lkR, m]), {
    runs: 1, concept: "Query tree as written: σ above ⋈ (join every slice, filter afterwards)"
  });
  const good = step("3b", "Written well: $match first, then $lookup", aggQ(images, [m, lkR]), {
    runs: 1, concept: "σ pushed below ⋈ by hand"
  });
  compare(bad, good, "3a", "3b",
          "MongoDB moved the $match in front of the $lookup by itself, then turned it into an index scan (idx_ESR).");

  section("Pair 2 · severe cases (severity = 3) with all their slices");
  const lkI = { $lookup: { from: I_NAME, localField: "patient_id", foreignField: "patient_id", as: "images" } };
  const sev = { $match: { severity: 3 } };
  const bad2 = step("3c", "Written badly: $lookup first, $match { severity: 3 } last", aggQ(report, [lkI, sev]), {
    runs: 1, concept: "σ above ⋈"
  });
  const good2 = step("3d", "Written well: $match { severity: 3 } first", aggQ(report, [sev, lkI]), {
    runs: 1, concept: "σ below ⋈"
  });
  compare(bad2, good2, "3c", "3d", "Same rewrite: the filter on " + R_NAME + " is applied before any slice is joined.");

  takeaway([
    "The aggregation optimizer applies Chapter 3 rule #6 automatically: a $match that does not use the $lookup output is moved in front of it.",
    "After the move, the filter is pushed into the scan itself (\"Pushed down\"), so the join only sees matching rows.",
    "PostgreSQL's planner does the same with WHERE clauses: the user does not have to hand-order the operators."
  ]);
  summary();
})();
