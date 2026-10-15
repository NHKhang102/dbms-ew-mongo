// Sort memory demo: external sort, π push-down, top-k, index order — used for slide 14, table A.0 row "External sort-merge"
(() => {
  requireData();
  banner({
    part: "MONGODB QUERY OPTIMIZATION · SORT & MEMORY",
    title: "Sorting under a memory limit: external sort, π push-down, top-k, index order",
    proposal: "Table A.0 row \"External sort-merge\" — supporting evidence for slide 14",
    chapter: "Section 3, external sort-merge (sorting data larger than memory)",
    watch: "the Sort line (MB sorted, in memory or spilled to disk) and how 14d, 14e and 14g avoid the big sort"
  });
  ensureIndex(report, { patient_id: 1 }, "patient_id_1");
  const lkR = { $lookup: { from: R_NAME, localField: "patient_id", foreignField: "patient_id", as: "rep" } };
  const sortBig = { $sort: { "rep.severity": -1, slice_location: 1 } };

  section("Part 1 · Sort on a joined field: no index can help");
  print("Join every slice with its report (each row now carries the full note text), then sort by the report's severity.");
  step("14a", "Join everything, then sort — disk use NOT allowed", aggQ(images, [lkR, sortBig], { allowDiskUse: false }), {
    runs: 1, concept: "The rows to sort are larger than the in-memory sort buffer",
    onError: "This error is the evidence: the sort buffer is 32 MB on Atlas M0 (100 MB on a self-hosted server).\n" +
             "Without permission to use disk, MongoDB refuses instead of switching to an external sort."
  });
  step("14b", "Same pipeline, disk use allowed (allowDiskUse: true)", aggQ(images, [lkR, sortBig], { allowDiskUse: true }), {
    runs: 1, concept: "Chapter 3 external sort-merge: sorted runs are written to disk, then merged",
    note: "Look at the Sort line: the data is larger than the 32 MB buffer, so it spilled to disk."
  });
  tryRun("14c", "Same as 14b, run as a normal query on Atlas M0", () => {
    const t = Date.now();
    images.aggregate([lkR, sortBig], { allowDiskUse: true }).next();
    info("14c", "Same as 14b, run as a normal query on Atlas M0", "✔ finished in " + nf(Date.now() - t) + " ms (disk use allowed)",
         { query: "db." + I_NAME + ".aggregate([ …same as 14b… ], { allowDiskUse: true }).next()" });
  }, "Atlas M0 (free tier) refuses disk use for real queries even with allowDiskUse: true (14b was measured through explain).\n" +
     "On a self-hosted or dedicated server this query spills to disk and succeeds, as in 14b.");
  step("14d", "$project only the needed fields before sorting (no disk option)", aggQ(images, [
    lkR, { $project: { patient_id: 1, slice_location: 1, "rep.severity": 1 } }, sortBig]), {
    runs: 1, concept: "Push π down: smaller rows fit in the sort memory",
    note: "Same rows, same order as 14a — but each row no longer carries the full note, so the sort fits in memory."
  });
  step("14e", "Keep only the top 10 with $limit (no disk option)", aggQ(images, [lkR, sortBig, { $limit: 10 }]), {
    runs: 1, concept: "Top-k sort: memory holds 10 rows, not all of them"
  });

  section("Part 2 · Sort on an indexed field: the index already provides the order");
  dropIfExists(images, "slice_location_1");
  const q = findQ(images, {}, { sort: { slice_location: 1 }, limit: 10 });
  step("14f", "Sort by slice_location, no index", q, {
    runs: 1, concept: "Full scan + top-k SORT"
  });
  ensureIndex(images, { slice_location: 1 }, "slice_location_1");
  step("14g", "Sort by slice_location, with an index", q, {
    runs: 1, concept: "Ordered index scan replaces the sort",
    note: "No SORT stage: the B-tree is read in order and stops after 10 entries."
  });
  dropIfExists(images, "slice_location_1");

  takeaway([
    "Sorting data larger than memory needs Chapter 3's external sort-merge; MongoDB only does it if disk use is allowed.",
    "Ways around a big sort: project fewer fields first (π push-down), sort only the top k, or let an index supply the order.",
    "PostgreSQL makes the same trade-off with work_mem: beyond it the Sort node spills to temporary files."
  ]);
  summary();
})();
