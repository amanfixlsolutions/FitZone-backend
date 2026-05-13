/**
 * Migration 004 — Populate tenantId field on all documents where gym field exists.
 *
 * For each tenant-scoped collection, sets tenantId = gym (same ObjectId value).
 * Uses bulk write operations for performance.
 * Only updates documents where tenantId is not already set.
 *
 * Run: node backend/migrations/004_add_tenant_id.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set in environment.");
  process.exit(1);
}

// All tenant-scoped collections (Mongoose collection names are lowercase + pluralised)
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
  "settings",
  "users",
];

async function migrateCollection(db, collName) {
  const coll = db.collection(collName);

  // Count documents that need updating
  const total = await coll.countDocuments({
    gym:      { $exists: true, $ne: null },
    tenantId: { $in: [null, undefined] },
  });

  if (total === 0) {
    console.log(`  ⏭  ${collName}: no documents need updating`);
    return { collName, updated: 0, total: 0 };
  }

  // Use updateMany for simplicity and atomicity — MongoDB handles bulk internally
  const result = await coll.updateMany(
    { gym: { $exists: true, $ne: null }, tenantId: { $in: [null, undefined] } },
    [{ $set: { tenantId: "$gym" } }]   // aggregation pipeline update — copies gym → tenantId
  );

  console.log(`  ✅ ${collName}: ${result.modifiedCount} / ${total} documents updated`);
  return { collName, updated: result.modifiedCount, total };
}

async function run() {
  console.log("🔗 Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected.\n");

  const db = mongoose.connection.db;

  let totalUpdated = 0;
  let errors       = 0;

  for (const collName of TENANT_COLLECTIONS) {
    try {
      const { updated } = await migrateCollection(db, collName);
      totalUpdated += updated;
    } catch (err) {
      console.error(`  ❌ ${collName}: ${err.message}`);
      errors++;
    }
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`  Total documents updated : ${totalUpdated}`);
  console.log(`  Collections with errors : ${errors}`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected.");
  process.exit(errors > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
