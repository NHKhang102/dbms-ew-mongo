// =====================================================================================
//  lib/common.js — shared helpers for every demo.
//  run.sh loads this file first and then one file from demos/ in the same mongosh
//  session, so everything defined here is visible to the demo scripts.
//  Settings come from environment variables that run.sh reads from .env.
// =====================================================================================
var DB_NAME = process.env.MONGODB_DB || "mri_demo";
var R_NAME = process.env.REPORT_COLL || "report";      // radiologist notes (Mendeley s6bgczr8s2)
var I_NAME = process.env.IMAGE_COLL || "mri_image";    // lumbar-spine MRI DICOM headers (Mendeley k57fr854j2)
var FULL_NLJ = process.env.FULL_NLJ === "1";           // demo 2: also run the unindexed nested-loop join on ALL reports (slow)
var OUTER_SMALL = 10;                                  // demo 2: number of outer reports for the unindexed nested-loop join

var mdb = db.getSiblingDB(DB_NAME);
var report = mdb.getCollection(R_NAME), images = mdb.getCollection(I_NAME);
var ROWS = [];                                         // rows of the summary table printed at the end of each demo
var LINE = 92;                                         // width of separator lines
var LABEL = 11;                                        // width of the field labels ("Query", "Plan", ...)

// Query shared by slide 11 and slide 12 (compound index / ESR rule)
var Q_ESR = { modality: "T2", instance_number: { $lte: 3 } };
var S_ESR = { patient_id: 1 };
var IDX_ESR = [["idx_RES", { instance_number: 1, modality: 1, patient_id: 1 }],
               ["idx_ERS", { modality: 1, instance_number: 1, patient_id: 1 }],
               ["idx_ESR", { modality: 1, patient_id: 1, instance_number: 1 }]];

// Chapter 3 names for the join strategies MongoDB reports
var JOIN_ALGO = { NestedLoopJoin: "J1 nested-loop", IndexedLoopJoin: "J2 single-loop (index)", HashJoin: "J4 hash join" };

// One-line meaning of each plan stage, printed next to the stage in the plan tree
var STAGE_MEANING = {
  COLLSCAN: "full collection scan: reads every document",
  IXSCAN: "B-tree index scan over the key range below",
  EXPRESS_IXSCAN: "8.0 express path: single-key lookup, bypasses the planner",
  IDHACK: "_id fast path",
  FETCH: "loads the full document for each index entry",
  SORT: "blocking sort in memory",
  LIMIT: "stops after N results",
  SKIP: "skips the first N results",
  PROJECTION_COVERED: "answers from the index alone, no document read",
  PROJECTION_SIMPLE: "keeps only the requested fields",
  PROJECTION_DEFAULT: "reshapes each document",
  EQ_LOOKUP: "$lookup join executed by the slot-based engine",
  GROUP: "$group executed by the slot-based engine",
  TEXT_MATCH: "checks the text-search terms",
  TEXT_OR: "unions the text-index matches",
  AND_SORTED: "intersects two index scans",
  AND_HASH: "intersects two index scans (hash)",
  OR: "unions several index scans"
};

// ---------- Formatting ----------
// Convert server Long/Int64 values to JS numbers
function num(v) {
  if (v && typeof v === "object") {
    if (typeof v.toNumber === "function") return v.toNumber();
    if ("low" in v && "high" in v) return v.high * 4294967296 + (v.low >>> 0);
  }
  return v;
}
// 48345 → "48,345"
function nf(v) {
  v = num(v);
  return typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(v);
}
// Print a value the way it is typed in mongosh: { patient_id: 1, modality: "T2" }
function fmt(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Object.prototype.toString.call(v) === "[object RegExp]") return String(v);
  if (Array.isArray(v)) return "[" + v.map(fmt).join(", ") + "]";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "object") {
    if (v._bsontype === "ObjectId" || v._bsontype === "ObjectID") return 'ObjectId("' + v.toHexString() + '")';
    if (v._bsontype) return String(v);
    const keys = Object.keys(v);
    if (!keys.length) return "{}";
    return "{ " + keys.map(k => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ": " + fmt(v[k])).join(", ") + " }";
  }
  return String(v);
}
// "  Label     : text" — continuation lines are aligned under the text
function field(label, text) {
  const pad = " ".repeat(LABEL + 4);
  String(text).split("\n").forEach((line, i) =>
    print(i === 0 ? "  " + (label + " ".repeat(LABEL)).slice(0, LABEL) + ": " + line : pad + line));
}
var setup = text => print("  ▸ setup: " + text);

// ---------- Queries ----------
// A query object = shell text for the log + a function that returns its explain output
function findQ(coll, filter, o) {
  o = o || {};
  let text = "db." + coll.getName() + ".find(" + fmt(filter) + (o.proj ? ", " + fmt(o.proj) : "") + ")";
  if (o.sort) text += ".sort(" + fmt(o.sort) + ")";
  if (o.limit) text += ".limit(" + o.limit + ")";
  if (o.hint) text += ".hint(" + fmt(o.hint) + ")";
  return {
    text: text, kind: "find",
    run: mode => {
      let c = o.proj ? coll.find(filter, o.proj) : coll.find(filter);
      if (o.sort) c = c.sort(o.sort);
      if (o.limit) c = c.limit(o.limit);
      if (o.hint) c = c.hint(o.hint);
      return c.explain(mode || "executionStats");
    }
  };
}
function aggQ(coll, pipeline, opts) {
  const hasOpts = opts && Object.keys(opts).length;
  const text = "db." + coll.getName() + ".aggregate([\n" + pipeline.map(st => "  " + fmt(st)).join(",\n") +
               "\n]" + (hasOpts ? ", " + fmt(opts) : "") + ")";
  return {
    text: text, kind: "aggregate",
    written: pipeline.map(st => Object.keys(st)[0]),
    run: mode => coll.explain(mode || "executionStats").aggregate(pipeline, opts || {})
  };
}

// ---------- Reading explain output ----------
function findKey(o, key, d) {
  d = d || 0;
  if (!o || typeof o !== "object" || d > 12) return null;
  if (Object.prototype.hasOwnProperty.call(o, key)) return o;
  for (const k of Object.keys(o)) { const r = findKey(o[k], key, d + 1); if (r) return r; }
  return null;
}
function rootOf(exp) { return exp.queryPlanner ? exp : (findKey(exp, "queryPlanner") || exp); }
// Walk a plan tree → [{depth, node}], parent before children
function planNodes(node, depth, out) {
  depth = depth || 0; out = out || [];
  if (!node || typeof node !== "object") return out;
  if (node.queryPlan) node = node.queryPlan;
  if (node.stage) out.push({ depth: depth, node: node });
  for (const k of ["inputStage", "outerStage", "innerStage", "thenStage", "elseStage"])
    if (node[k]) planNodes(node[k], depth + 1, out);
  if (Array.isArray(node.inputStages)) node.inputStages.forEach(c => planNodes(c, depth + 1, out));
  return out;
}
// Prefer the executed tree (has per-stage counts); the slot-based engine only gives the planned tree
function bestNodes(root) {
  const es = root.executionStats && root.executionStats.executionStages;
  if (es && /^[A-Z_]+$/.test(es.stage || "")) return planNodes(es);
  return planNodes(root.queryPlanner && root.queryPlanner.winningPlan);
}
function pipelineStages(exp) {
  return Array.isArray(exp.stages)
    ? exp.stages.map(st => ({ name: Object.keys(st).find(k => k[0] === "$"), st: st }))
    : [];
}
// Plan shape without numbers, used to check that two queries run the same way
function signature(exp) {
  const root = rootOf(exp);
  const t = planNodes(root.queryPlanner && root.queryPlanner.winningPlan).map(x => x.node.stage + (x.node.indexName ? ":" + x.node.indexName : ""));
  return t.join(">") + " | " + pipelineStages(exp).map(s => s.name).join(">");
}
function boundsText(b) {
  return Object.keys(b).map(k => k + " " + b[k].join(" ∪ ")).join(" · ");
}
function nodeLines(x) {
  const n = x.node, head = [n.stage];
  if (n.stage === "EQ_LOOKUP") {
    head.push("from " + String(n.foreignCollection).split(".").pop() + " on " + n.localField + " = " + n.foreignField);
    if (n.strategy) head.push("· " + n.strategy);
  }
  const kp = n.keyPattern ? " " + (typeof n.keyPattern === "string" ? n.keyPattern : fmt(n.keyPattern)) : "";
  if (n.indexName) head.push((n.stage === "EQ_LOOKUP" ? "· index " : "") + n.indexName + kp);
  if (n.sortPattern) head.push("by " + fmt(n.sortPattern));
  if (n.limitAmount !== undefined) head.push("limit " + n.limitAmount);
  if (n.isMultiKey) head.push("(multikey)");
  const stats = [];
  if (n.nReturned !== undefined) stats.push("out " + nf(n.nReturned));
  if (n.keysExamined !== undefined) stats.push("keys " + nf(n.keysExamined));
  if (n.docsExamined !== undefined) stats.push("docs " + nf(n.docsExamined));
  if (n.usedDisk) stats.push("usedDisk");
  const indent = "  ".repeat(x.depth) + (x.depth ? "└ " : "");
  const lines = [indent + head.join(" ") + (stats.length ? "  [" + stats.join(" · ") + "]" : "") +
                 (STAGE_MEANING[n.stage] ? "   — " + STAGE_MEANING[n.stage] : "")];
  const sub = "  ".repeat(x.depth) + (x.depth ? "    " : "  ");
  if (n.indexBounds) lines.push(sub + "bounds: " + boundsText(n.indexBounds));
  if (n.filter && Object.keys(n.filter).length) lines.push(sub + "filter: " + fmt(n.filter));
  return lines;
}

// ---------- Running one demo step ----------
var median = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
function stepHeader(id, title, o) {
  print("\n" + "─".repeat(LINE));
  print("Step " + id + " · " + title);
  if (o && o.concept) field("Concept", o.concept);
}
// Explain query q (`runs` times, median server time), print what the optimizer did, add a summary row
function step(id, title, q, o) {
  o = o || {};
  const runs = o.runs || 3;
  stepHeader(id, title, o);
  field("Query", q.text);
  let exp; const servers = [];
  try {
    for (let i = 0; i < runs; i++) {
      exp = q.run(o.mode);
      const s = rootOf(exp).executionStats;
      if (s && s.executionTimeMillis !== undefined) servers.push(num(s.executionTimeMillis));
    }
  } catch (e) { fail(id, title, e, o.onError); return null; }
  showExplain(id, title, q, exp, servers.length ? median(servers) : undefined, runs, o);
  return exp;
}
function showExplain(id, title, q, exp, ms, runs, o) {
  const root = rootOf(exp), qp = root.queryPlanner || {}, s = root.executionStats || {};
  const nodes = bestNodes(root), stages = pipelineStages(exp);
  const rejected = (qp.rejectedPlans || []).length;
  if (s.executionSuccess === false) { fail(id, title, { message: s.errorMessage, codeName: s.errorCode }, o.onError); return; }

  field("Engine", (exp.explainVersion === "2" ? "slot-based execution engine (SBE)" : "classic engine") + " · " +
        (rejected ? (rejected + 1) + " candidate plans raced, " + rejected + " rejected" : "1 candidate plan (no race needed)"));
  const planLines = [];
  nodes.forEach(x => nodeLines(x).forEach(l => planLines.push(l)));
  field("Plan", planLines.length ? planLines.join("\n") : "(none)");

  // Aggregations: what the optimizer pushed into the find/index layer, and the stage order after rewriting
  const flow = nodes.slice().reverse().map(x => x.node.stage);
  const rest = stages.map(x => x.name).filter(nm => nm !== "$cursor");
  if (q.kind === "aggregate") {
    const pq = qp.parsedQuery;
    if (pq && Object.keys(pq).length) field("Pushed down", fmt(pq) + "\n↑ this filter now runs inside the scan, before any later stage");
    field("As written", q.written.join(" → "));
    field("Runs as", flow.concat(rest).join(" → ") + "   (after optimization)");
  }

  // Joins and other stage details
  let out = num(s.nReturned), keys = num(s.totalKeysExamined) || 0, docs = num(s.totalDocsExamined) || 0;
  const joins = [];
  nodes.filter(x => x.node.strategy).forEach(x =>
    joins.push(x.node.strategy + (JOIN_ALGO[x.node.strategy] ? " = Chapter 3 " + JOIN_ALGO[x.node.strategy] : "")));
  stages.forEach(({ name, st }) => {
    if (name === "$lookup") {
      // A $lookup run by the classic engine has no "strategy" field: infer it from the index use
      const spec = st.$lookup, used = st.indexesUsed || [];
      const kind = used.length ? "IndexedLoopJoin" : "NestedLoopJoin";
      let t = kind + " = Chapter 3 " + JOIN_ALGO[kind] + " (classic $lookup" + (used.length ? ", index " + used.join(", ") : "") + ")";
      if (spec.unwinding) t += "\n$unwind absorbed into the $lookup";
      if (spec.pipeline && spec.pipeline.length) t += "\nlater $match absorbed into the $lookup: " + fmt(spec.pipeline);
      joins.push(t);
      keys += num(st.totalKeysExamined) || 0;
      docs += num(st.totalDocsExamined) || 0;
    }
    if (name === "$sort" && st.totalDataSizeSortedBytesEstimate !== undefined)
      field("Sort", "sorted ~" + nf(num(st.totalDataSizeSortedBytesEstimate) / 1048576) + " MB" + (st.usedDisk ? ", spilled to disk" : ", in memory"));
    if (name !== "$cursor" && st.nReturned !== undefined) out = num(st.nReturned);
  });
  if (joins.length) field("Join", joins.join("\n"));

  const ratio = out ? +(docs / out).toFixed(1) : (docs ? "∞" : 0);
  field("Result", nf(out) + " returned · " + nf(keys) + " index keys + " + nf(docs) + " documents examined" +
        "\n→ documents examined per result: " + nf(ratio) + " · " +
        (ms === undefined ? "n/a" : nf(ms) + " ms on server") + " (" + (runs > 1 ? "median of " + runs + " runs" : "1 run") + ")");
  if (o.note) field("Note", o.note);

  ROWS.push({ step: id, desc: title, flow: flow.concat(rest).join(" → "), join: joins.map(j => j.split(" = ")[0]).join(", "),
              out: out, keys: keys, docs: docs, ratio: ratio, ms: ms });
}
// Print an error as a step result (on Atlas M0 some errors are the expected evidence)
function fail(id, title, e, explanation) {
  const msg = (e.codeName ? e.codeName + ": " : "") + e.message;
  field("Result", "✖ ERROR — " + msg);
  if (explanation) field("Note", explanation);
  ROWS.push({ step: id, desc: title, flow: "ERROR: " + (e.codeName || msg) });
}
// A step whose result is a fact rather than an explain (e.g. a hash comparison)
function info(id, title, text, o) {
  stepHeader(id, title, o);
  if (o && o.query) field("Query", o.query);
  field("Result", text);
  ROWS.push({ step: id, desc: title, flow: text.split("\n")[0] });
}
function tryRun(id, title, fn, explanation) {
  try { fn(); } catch (e) { stepHeader(id, title); fail(id, title, e, explanation); }
}
// Check that two ways of writing a query end up with the same plan
function compare(a, b, ida, idb, meaning) {
  print("\n" + "─".repeat(LINE));
  if (!a || !b) { print("Plan check " + ida + " vs " + idb + ": skipped (a step failed)"); return; }
  const ok = signature(a) === signature(b);
  print("Plan check " + ida + " vs " + idb + ": " + (ok ? "✔ SAME PLAN" : "✖ DIFFERENT PLANS"));
  if (ok && meaning) field("Meaning", meaning);
  if (!ok) { field(ida, signature(a)); field(idb, signature(b)); }
  ROWS.push({ step: ida + " vs " + idb, desc: "Plan check", flow: ok ? "✔ same plan" : "✖ different plans" });
}

// ---------- Indexes ----------
// Create an index; if one with the same keys already exists under another name (e.g. made in Compass), reuse it
function ensureIndex(coll, keys, name, quiet) {
  if (!quiet) setup("db." + coll.getName() + ".createIndex(" + fmt(keys) + ")");
  try { coll.createIndex(keys, { name: name }); }
  catch (e) { if (e.code !== 85 && e.code !== 86) throw e; }
}
function dropIfExists(coll, name) {
  if (coll.getIndexes().some(i => i.name === name)) { coll.dropIndex(name); setup("db." + coll.getName() + ".dropIndex(\"" + name + "\")"); }
}
// Drop every index that starts with `field`, so neither find nor $lookup can use one on that field
function dropIndexesOnField(coll, fieldName) {
  coll.getIndexes().filter(i => i.name !== "_id_" && Object.keys(i.key)[0] === fieldName).forEach(i => {
    coll.dropIndex(i.name);
    setup("db." + coll.getName() + ".dropIndex(\"" + i.name + "\")   // no index on " + fieldName + " any more");
  });
}
// Drop all indexes except _id, to start from "no index at all"
function resetIndexes(coll) {
  coll.dropIndexes();
  setup("db." + coll.getName() + ".dropIndexes()   // only the _id index is left");
}
var idxNames = coll => coll.getIndexes().map(i => i.name).join(", ");

// ---------- Page layout ----------
function banner(o) {
  print("═".repeat(LINE));
  print(" " + o.part);
  print(" " + o.title);
  print("═".repeat(LINE));
  const rows = [["Topic", "Other QP&O techniques + QP&O in today's DBMSs — MongoDB " + mdb.version() + " on Atlas"],
                ["Proposal", o.proposal], ["Chapter 3", o.chapter], ["Watch for", o.watch],
                ["Data", DB_NAME + "." + I_NAME + " (" + nf(images.estimatedDocumentCount()) + " MRI slices) · " +
                         DB_NAME + "." + R_NAME + " (" + nf(report.estimatedDocumentCount()) + " radiology notes)"]];
  rows.filter(r => r[1]).forEach(r => field(r[0], r[1]));
}
function section(text) { print("\n" + "▌ " + text); }
function takeaway(lines) {
  print("\n" + "═".repeat(LINE));
  print(" TAKEAWAY");
  lines.forEach(l => print(" • " + l));
  print("═".repeat(LINE));
}
// Stop early if the collections are empty
function requireData() {
  const nr = report.estimatedDocumentCount(), ni = images.estimatedDocumentCount();
  if (!nr || !ni) {
    print("✖ Missing data: " + DB_NAME + "." + R_NAME + " = " + nr + ", " + DB_NAME + "." + I_NAME + " = " + ni +
          " documents. Run ./run.sh check_data to see what the database contains.");
    quit(2);
  }
}
// ---------- Interactive use (./run.sh shell) ----------
// Explain a query typed live and print it the same way as the demos:
//   show(db.mri_image, { patient_id: 1, modality: "T2" })                 → find with a filter
//   show(db.mri_image, { modality: "T2" }, { sort: { patient_id: 1 }, limit: 20, hint: "idx_ESR" })
//   show(db.mri_image.find({ patient_id: 1 }))                            → any find cursor
//   show(db.report, [ { $lookup: { ... } }, { $match: { ... } } ])        → aggregation pipeline
//   compareLast()                                                         → same plan for the last two show() calls?
var LIVE_EXPLAINS = [];
function show(target, second, third) {
  let q;
  if (Array.isArray(second)) q = aggQ(target, second, third);
  else if (second && typeof second === "object") q = findQ(target, second, third);
  else if (target && typeof target.explain === "function")
    q = { text: "(the find typed above)", kind: "find", run: () => target.explain("executionStats") };
  else { print("Usage: show(db.coll, { filter })  ·  show(db.coll, [ pipeline ])  ·  show(db.coll.find({ ... }))"); return; }
  ROWS = [];
  const exp = step("Q" + (LIVE_EXPLAINS.length + 1), "Live query", q, { runs: 1 });
  if (exp) LIVE_EXPLAINS.push(exp);
}
function compareLast() {
  const n = LIVE_EXPLAINS.length;
  if (n < 2) { print("Run show(...) twice first."); return; }
  compare(LIVE_EXPLAINS[n - 2], LIVE_EXPLAINS[n - 1], "Q" + (n - 1), "Q" + n,
          "Both ways of writing the query are executed with the same plan.");
}

// Summary table at the end of each output file; run.sh collects these into SUMMARY.md
function summary() {
  if (ROWS.length) {
    const cell = v => (v === undefined || v === null) ? "" : (typeof v === "number" ? nf(v) : String(v).replace(/\|/g, "/").replace(/\n/g, " "));
    print("\n### Summary");
    print("| Step | What it shows | Runs as | Join | Returned | Keys examined | Docs examined | Docs / result | Server ms |");
    print("|---|---|---|---|---|---|---|---|---|");
    ROWS.forEach(r => print("| " + [r.step, r.desc, r.flow, r.join, r.out, r.keys, r.docs, r.ratio, r.ms].map(cell).join(" | ") + " |"));
  }
  print("\nIndexes now | " + I_NAME + ": " + idxNames(images) + " | " + R_NAME + ": " + idxNames(report));
}
