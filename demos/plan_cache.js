// Plan cache demo: candidate plan race and caching — used for slide 12, E4(a) & E4(e)
(() => {
  requireData();
  banner({
    part: "MONGODB QUERY OPTIMIZATION · PLAN CACHE",
    title: "Plan selection: candidate plans race each other, the winner is cached",
    proposal: "E4(a) plan race and plan cache · E4(e) documents examined / returned — supporting evidence for slide 12",
    chapter: "Section 9, cost-based optimization — and how MongoDB does it differently",
    watch: "the candidate plans and their scores, and the query-shape hash staying the same when constants change"
  });
  IDX_ESR.forEach(x => ensureIndex(images, x[1], x[0]));
  print("\nThree indexes could answer the query below. No hint is given: the optimizer must choose.");

  const q = findQ(images, Q_ESR, { sort: S_ESR, limit: 20 });
  const e = step("12a", "Let the optimizer choose between 3 candidate indexes", q, {
    runs: 1, mode: "allPlansExecution",
    concept: "Empirical plan selection (multi-planner), no cost model"
  });
  if (e) {
    const root = rootOf(e), qp = root.queryPlanner;
    const lines = (root.executionStats.allPlansExecution || []).map((p, k) => {
      const ix = (findKey(p.executionStages, "indexName") || {}).indexName || "?";
      return "#" + (k + 1) + " " + (ix + "       ").slice(0, 8) + " returned " + p.nReturned + " · keys " + p.totalKeysExamined +
             " · docs " + p.totalDocsExamined + " · works " + (p.executionStages && p.executionStages.works) +
             (p.score !== undefined ? " · score " + (+p.score).toFixed(3) : "");
    });
    field("Trial run", lines.join("\n") + "\nEach plan ran for a short trial (until one returns 101 docs or the work budget runs out);\n" +
          "the plan that produced the most results per unit of work wins.");
    const h1 = qp.planCacheShapeHash || qp.queryHash;
    const q2 = findQ(images, { modality: "T1", instance_number: { $lte: 5 } }, { sort: S_ESR, limit: 20 });
    const qp2 = rootOf(q2.run("queryPlanner")).queryPlanner;
    const h2 = qp2.planCacheShapeHash || qp2.queryHash;
    info("12b", "Same query with different constants → same query shape?",
         "shape hash 12a = " + h1 + " · shape hash 12b = " + h2 + "\n" +
         (h1 === h2 ? "✔ identical: the constants are ignored, so the cached winner of 12a is reused without a new race"
                    : "✖ different shapes"),
         { query: q2.text, concept: "Plan cache key = query shape (the query without its constant values)" });
  }
  tryRun("12c", "Read the plan cache with getPlanCache().list()", () => {
    const l = images.getPlanCache().list();
    info("12c", "Read the plan cache with getPlanCache().list()",
         l.length + " cached entries\n" + l.slice(0, 3).map(x => fmt({ hash: x.planCacheShapeHash || x.queryHash, isActive: x.isActive, works: num(x.works) })).join("\n"),
         { query: "db." + I_NAME + ".getPlanCache().list()" });
  }, "Atlas M0 (free tier) does not allow $planCacheStats — expected. On a dedicated cluster this lists the cached winners.");

  takeaway([
    "PostgreSQL is cost-based: it estimates each plan's cost from statistics (pg_statistic, histograms) before running anything.",
    "MongoDB has no statistics-based cost model: it races the candidate plans for a short trial and keeps the winner.",
    "The winner is cached per query shape, so later queries with other constants skip the race (12b)."
  ]);
  summary();
})();
