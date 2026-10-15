// Connection and data check (both Mendeley datasets present, patient_id values match) — run this first
(() => {
  print("═".repeat(LINE));
  print(" CONNECTION & DATA CHECK");
  print("═".repeat(LINE));
  field("Server", "MongoDB " + mdb.version() + " · database " + DB_NAME);
  field("Purpose", "confirm the demos run on the two required Mendeley datasets only (team guide HUONG_DAN, steps 9 and 11)");

  const names = mdb.getCollectionNames().sort();
  print("\nCollections in " + DB_NAME + ":");
  if (!names.length) print("  (none)");
  names.forEach(n => print("  - " + n + ": " + nf(mdb.getCollection(n).estimatedDocumentCount()) + " documents"));

  const legacy = ["reports", "mri_images", "finding_dict", "lumbar_records_benchmark"].filter(n => names.includes(n));
  if (legacy.length)
    print("\n✖ Collections from the old package (synthetic/fake data) are still here: " + legacy.join(", ") +
          "\n  The team guide says to drop them: " + legacy.map(n => "db." + n + ".drop()").join("; "));
  if (!names.includes(R_NAME) || !names.includes(I_NAME)) {
    print("\n✖ Collection " + R_NAME + " and/or " + I_NAME + " not found in database " + DB_NAME + "." +
          "\n  If the data uses other names, set MONGODB_DB / REPORT_COLL / IMAGE_COLL in .env.");
    quit(2);
  }

  let ok = true;
  const check = (cond, good, bad) => { print("  " + (cond ? "✔ " + good : "✖ " + bad)); if (!cond) ok = false; };
  const keysOf = coll => {
    const s = new Set();
    coll.aggregate([{ $sample: { size: 50 } }]).forEach(d => Object.keys(d).forEach(k => s.add(k)));
    return s;
  };

  print("\nChecks:");
  const nr = report.countDocuments(), ni = images.countDocuments();
  check(nr === 575, R_NAME + ": 575 radiology notes (complete dataset s6bgczr8s2)", R_NAME + ": " + nr + " documents, expected exactly 575");
  check(ni > 0 && ni <= 48345,
        I_NAME + ": " + nf(ni) + " DICOM slices" + (ni < 48345 ? " (fewer than 48,345: only part of the images was loaded, still usable)" : " (complete dataset k57fr854j2)"),
        I_NAME + ": " + nf(ni) + " documents, expected at most 48,345 (imported twice?)");

  const rk = keysOf(report), ik = keysOf(images);
  const missR = ["patient_id", "clinician_notes", "levels", "findings", "severity", "has_note"].filter(f => !rk.has(f));
  const missI = ["patient_id", "study_folder", "series_description", "modality", "plane",
                 "instance_number", "slice_location", "file_path"].filter(f => !ik.has(f));
  check(!missR.length, R_NAME + ": original notes + derived query fields present", R_NAME + " is missing fields: " + missR.join(", "));
  check(!missI.length, I_NAME + ": DICOM header fields present", I_NAME + " is missing fields: " + missI.join(", "));

  const badR = report.countDocuments({ patient_id: { $not: { $type: "number" } } });
  const badI = images.countDocuments({ patient_id: { $not: { $type: "number" } } });
  check(badR === 0 && badI === 0, "patient_id is numeric in both collections",
        "non-numeric patient_id: " + R_NAME + " = " + badR + ", " + I_NAME + " = " + badI + " documents");

  const mods = images.distinct("modality"), planes = images.distinct("plane");
  check(mods.includes("T1") && mods.includes("T2"), "modality includes T1 and T2: " + fmt(mods), "modality lacks T1/T2: " + fmt(mods));
  check(planes.includes("SAGITTAL") && planes.includes("AXIAL"), "plane includes SAGITTAL and AXIAL: " + fmt(planes),
        "plane lacks SAGITTAL/AXIAL: " + fmt(planes));

  const pidsI = images.distinct("patient_id"), withImg = new Set(pidsI.map(String));
  const pidsR = report.distinct("patient_id"), linked = pidsR.filter(p => withImg.has(String(p))).length;
  check(linked > 0, "reports with matching images: " + linked + " / " + pidsR.length + " (the join key works)",
        "reports with matching images: 0 / " + pidsR.length + " → patient_id values do not match. Stop and fix the data.");

  print("\nMore facts:");
  field("Patients", nf(pidsI.length) + " with images · patient_id from " + Math.min(...pidsI) + " to " + Math.max(...pidsI));
  field("Empty notes", report.countDocuments({ has_note: false }) + " reports with has_note = false (team guide: 60)");
  const byMod = images.aggregate([{ $group: { _id: "$modality", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
  const byPlane = images.aggregate([{ $group: { _id: "$plane", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
  field("By modality", byMod.map(x => x._id + " " + nf(x.n)).join(" · "));
  field("By plane", byPlane.map(x => x._id + " " + nf(x.n)).join(" · "));
  try {
    const st = mdb.stats(1024 * 1024);
    field("Storage", "data " + num(st.dataSize).toFixed(1) + " MB · indexes " + num(st.indexSize).toFixed(1) + " MB (Atlas M0 limit: 512 MB)");
  } catch (e) { field("Storage", "n/a (" + e.message + ")"); }

  const r = report.findOne({ has_note: true }, { _id: 0 });
  if (r && typeof r.clinician_notes === "string" && r.clinician_notes.length > 300) r.clinician_notes = r.clinician_notes.slice(0, 300) + "…";
  print("\nSample " + R_NAME + " document:"); printjson(r);
  print("Sample " + I_NAME + " document:"); printjson(images.findOne({}, { _id: 0 }));

  print("\n" + (ok ? "RESULT: ✔ the data matches the team guide — the demos can run."
                   : "RESULT: ✖ fix the items marked ✖ above before running the demos."));
  summary();
})();
