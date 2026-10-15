// EXTRA, not in the proposal (optional): MongoDB today — classic engine vs slot-based engine (SBE), setQuerySettings (8.0)
(() => {
  requireData();
  banner({
    part: "MONGODB QUERY OPTIMIZATION · EXTRA (not in the proposal, optional)",
    title: "Query processing in MongoDB today: classic engine vs slot-based engine, query settings",
    proposal: "Not in the proposal — fits the \"QP&O in today's DBMSs\" part of the topic",
    chapter: "Beyond Chapter 3: execution engines and persistent plan hints",
    watch: "which engine runs each query (\"Engine\" line)"
  });
  ensureIndex(images, { modality: 1, patient_id: 1, instance_number: 1 }, "idx_ESR");
  step("Sa", "A plain find()", findQ(images, { modality: "T1" }), {
    runs: 1, concept: "Simple finds stay on the classic engine in MongoDB 8.0"
  });
  step("Sb", "$match + $group", aggQ(images, [{ $match: { modality: { $ne: null } } },
                                            { $group: { _id: { modality: "$modality", plane: "$plane" }, n: { $sum: 1 } } }]), {
    concept: "$group and $lookup are pushed down to the slot-based engine (SBE), a newer, faster executor"
  });

  const shape = { find: I_NAME, filter: { modality: "T2" }, $db: DB_NAME };
  tryRun("Sc", "Pin an index to a query shape with setQuerySettings (MongoDB 8.0)", () => {
    mdb.adminCommand({ setQuerySettings: shape,
                       settings: { indexHints: { ns: { db: DB_NAME, coll: I_NAME }, allowedIndexes: ["idx_ESR"] } } });
    info("Sc", "Pin an index to a query shape with setQuerySettings (MongoDB 8.0)", "✔ query settings stored",
         { query: "db.adminCommand({ setQuerySettings: " + fmt(shape) + ", settings: { indexHints: … idx_ESR } })" });
    step("Sd", "The same query shape after setQuerySettings", findQ(images, { modality: "T2" }), { runs: 1 });
    mdb.adminCommand({ removeQuerySettings: shape });   // remove at once so other demos are not affected
    setup("removeQuerySettings — settings removed again");
  }, "Atlas M0 (free tier) does not support setQuerySettings — expected. Present it as a MongoDB 8.0 feature.");

  takeaway([
    "MongoDB 8.0 runs two execution engines side by side; the optimizer decides which parts of a query go to SBE.",
    "Query settings let a DBA fix the plan choice for a query shape without changing application code."
  ]);
  summary();
})();
