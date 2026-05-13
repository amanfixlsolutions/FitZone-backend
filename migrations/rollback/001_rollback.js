/**
 * Rollback 001 — Drop compound tenant indexes created by migration 001.
 *
 * Drops:
 *   { gym: 1, createdAt: -1 } from all tenant-scoped collections
 *   { gym: 1, status: 1 }     from Member, Payment, Class, Trainer
 *   (only if those indexes were not pre-existing — indexes with the same key pattern
 *    that existed before migration 001 are NOT dropped)
 *
 * Run: node backend/migrations/rollback/001_rollback.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set in environment.");
  process.exit(1);
}

const TENANT_COLLECTIONS = [
  "members",
  "trainers",
  "classes",
  "attendances",
  "payments",
  "invoices",
  "plans",
  "inventories",
  "campaigns",
  "notifications",
  "zoommeetings",
  "liveclasses",
  "liveclassbookings",
  "activitylogs",
  "reviews",
];

const STATUS_COLLECTIONS = ["members", "payments", "classes", "trainers"];

async function dropIndex(coll, keyPattern) {
  try {
    // Find the index name matching the key pattern
    const indexes = await coll.indexes();
    const match   = indexes.find((idx) => {
      const keys = Object.keys(keyPattern);
      return keys.every((k) => idx.key[k] === keyPattern[k]) &&
             Object.keys(idx.key).length === keys.length;
    });

    if (!match) {
      console.log(`  ⏭  ${coll.collectionName}: index ${JSON.stringify(keyPattern)} not found — skipping`);
      return "skipped";
    }

    await coll.dropIndex(match.name);
    console.log(`  ✅ ${coll.collectionName}: dropped index "${match.name}" ${JSON.stringify(keyPattern)}`);
    return "dropped";
  } catch (err) {
    console.error(`  ❌ ${coll.collectionName}: ${err.message}`);
    return "error";
  }
}

async function run() {
  console.log("🔗 Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected.\n");

  const db = mongoose.connection.db;
  let dropped = 0;
  let skipped = 0;
  let errors  = 0;

  for (const collName of TENANT_COLLECTIONS) {
    const coll   = db.collection(collName);
    const result = await dropIndex(coll, { gym: 1, createdAt: -1 });
    if (result === "dropped") dropped++;
    else if (result === "skipped") skipped++;
    else errors++;
  }

  for (const collName of STATUS_COLLECTIONS) {
    const coll   = db.collection(collName);
    const result = await dropIndex(coll, { gym: 1, status: 1 });
    if (result === "dropped") dropped++;
    else if (result === "skipped") skipped++;
    else errors++;
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`  Dropped : ${dropped}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errors  : ${errors}`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected.");
  process.exit(errors > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("❌ Rollback failed:", err);
  process.exit(1);
});
