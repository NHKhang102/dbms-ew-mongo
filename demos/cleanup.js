// Clean-up: drop every index the demos created (except _id) on both collections; the data is not touched
(() => {
  print(" CLEAN-UP: drop demo indexes (run after the demos, or before a teammate runs them)");
  field("Before", I_NAME + ": " + idxNames(images) + "\n" + R_NAME + ": " + idxNames(report));
  resetIndexes(images);
  resetIndexes(report);
  try { mdb.adminCommand({ removeQuerySettings: { find: I_NAME, filter: { modality: "T2" }, $db: DB_NAME } }); } catch (e) { /* none set, or not supported on M0 */ }
  field("After", I_NAME + ": " + idxNames(images) + "\n" + R_NAME + ": " + idxNames(report));
  print("(Atlas Search indexes, if any, are not affected.)");
})();
