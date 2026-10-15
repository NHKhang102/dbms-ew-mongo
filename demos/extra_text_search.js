// EXTRA, not in the proposal (optional): searching the radiologist notes — regex scan vs text index (inverted index)
(() => {
  requireData();
  banner({
    part: "MONGODB QUERY OPTIMIZATION · EXTRA (not in the proposal, optional)",
    title: "Text search on radiology notes: regex scan vs text index (inverted index)",
    proposal: "Not in the proposal — usable as an extra point for slide 5 or 14",
    chapter: "Beyond Chapter 3: inverted indexes for text",
    watch: "COLLSCAN for a regex vs an index scan for $text, and what keyword search gets wrong"
  });
  dropIfExists(report, "notes_text");
  step("Ta", "Regex search for 'stenosis'", findQ(report, { clinician_notes: /stenosis/i }), {
    concept: "A case-insensitive regex cannot use a B-tree index → full scan"
  });
  ensureIndex(report, { clinician_notes: "text" }, "notes_text");
  step("Tb", "$text search for 'stenosis' with a text index", findQ(report, { $text: { $search: "stenosis" } }), {
    concept: "Inverted index: word → list of documents"
  });
  step("Tc", "$text search for 'herniation'", findQ(report, { $text: { $search: "herniation" } }), {
    runs: 1, concept: "Fast, but keyword matching has no notion of meaning",
    note: "Many matches are negations such as \"No evidence of disc herniation\"."
  });
  info("Td", "Compare with the derived field findings", report.countDocuments({ findings: /hernia/i }) + " reports really list a herniation finding",
       { query: "db." + R_NAME + ".countDocuments({ findings: /hernia/i })" });
  const top = report.aggregate([{ $unwind: "$findings" }, { $group: { _id: "$findings", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]).toArray();
  field("Top findings", top.map(x => x._id + " " + x.n).join(" · "));

  takeaway([
    "A text index turns a full scan into an index lookup, but it matches words, not meaning.",
    "Pre-processing the notes into structured fields (findings, severity) is also query optimization."
  ]);
  summary();
})();
