// Printed when ./run.sh shell opens: a short cheat sheet for typing the demo queries live
db = mdb;   // the URI may not name a database: make `db` point at the demo database
// Short names for the two $lookup stages used in the live demos (the "Query" line still prints them in full)
var lookupImages = { $lookup: { from: I_NAME, localField: "patient_id", foreignField: "patient_id", as: "images" } };
var lookupReport = { $lookup: { from: R_NAME, localField: "patient_id", foreignField: "patient_id", as: "rep" } };
print("═".repeat(LINE));
print(" MongoDB " + mdb.version() + " · database " + DB_NAME + " · demo helpers loaded");
print("═".repeat(LINE));
print(" Explain a query in readable form:");
print("   show(db." + I_NAME + ", { patient_id: 1, modality: \"T2\" })");
print("   show(db." + R_NAME + ", [ { $lookup: { from: \"" + I_NAME + "\", localField: \"patient_id\", foreignField: \"patient_id\", as: \"images\" } } ])");
print("   compareLast()                      // same plan for the last two show() calls?");
print(" Shortcuts: lookupImages = " + fmt(lookupImages));
print("            lookupReport = " + fmt(lookupReport));
print(" Indexes:   db." + I_NAME + ".createIndex({ patient_id: 1, modality: 1 }) · db." + I_NAME + ".getIndexes() · db." + I_NAME + ".dropIndexes()");
print(" Full demo: load(\"demos/demo1_selection.js\")   (same output as ./run.sh demo1)");
print(" Raw explain still works: db." + I_NAME + ".find({ ... }).explain(\"executionStats\")");
print(" Exit: exit");
