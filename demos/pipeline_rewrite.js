// Pipeline rewrite demo: aggregation pipeline optimizer — used for slide 13, E4(d)
(() => {
  requireData();
  banner({
    part: "MONGODB QUERY OPTIMIZATION · PIPELINE REWRITE",
    title: "Aggregation pipeline optimizer: rewrite rules applied to a pipeline",
    proposal: "E4(d) — supporting evidence for slide 13",
    chapter: "Section 8, heuristic optimization: push σ down, combine operations",
    watch: "\"As written\" vs \"Runs as\": stages are moved, merged or absorbed before execution"
  });
  ensureIndex(images, { modality: 1, patient_id: 1, instance_number: 1 }, "idx_ESR");
  ensureIndex(images, { patient_id: 1 }, "patient_id_1");
  ensureIndex(report, { patient_id: 1 }, "patient_id_1");
  print("\n(Moving $match in front of $lookup is shown in live demo 3. These are the other rewrite rules.)");

  step("13a", "$addFields then $match on an original field", aggQ(images, [
    { $addFields: { pixels: { $multiply: ["$rows", "$columns"] } } }, { $match: { modality: "T1" } }]), {
    runs: 1, concept: "Push σ below a computed projection",
    note: "The $match does not use the computed field, so it is moved before $addFields and becomes an index scan."
  });
  step("13b", "$sort on an unindexed field + $limit 5", aggQ(images, [{ $sort: { slice_location: -1 } }, { $limit: 5 }]), {
    runs: 1, concept: "Combine operations: sort + limit → top-k sort",
    note: "The SORT stage carries limit 5: it keeps only the best 5 rows in memory instead of sorting all slices."
  });
  const lkI = { $lookup: { from: I_NAME, localField: "patient_id", foreignField: "patient_id", as: "images" } };
  step("13c", "$lookup + $unwind + $match", aggQ(report, [
    { $match: { severity: 3 } }, lkI, { $unwind: "$images" }, { $match: { "images.plane": "AXIAL" } }]), {
    runs: 1, concept: "Combine operations: $unwind and the following $match are absorbed into the $lookup",
    note: "Only AXIAL slices are joined at all, and no intermediate array is built."
  });

  takeaway([
    "Before running, MongoDB rewrites the pipeline using the same ideas as Chapter 3's heuristic rules.",
    "Filters move toward the data source, sort + limit becomes top-k, and $lookup + $unwind + $match become one join stage.",
    "Users can write the pipeline in a natural order; the optimizer takes care of the efficient order."
  ]);
  summary();
})();
