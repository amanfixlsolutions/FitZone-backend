/**
 * Rollback 004 — Remove the tenantId field from all tenant-scoped collections.
 *
 * Run: node backend/migrations/rollback/004_rollback.js
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
  "settings",
  "users",
];

async function run() {
  console.log("🔗 Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected.\n");

  const db = mongoose.connection.db;

  let totalRemoved = 0;
  let errors       = 0;

  for (const collName of TENANT_COLLECTIONS) {
    try {
      const coll  = db.collection(collName);
      const count = await coll.countDocuments({ tenantId: { $exists: true } });

      if (count === 0) {
        console.log(`  ⏭  ${collName}: no tenantId field found — skipping`);
        continue;
      }

      const result = await coll.updateMany(
        { tenantId: { $exists: true } },
        { $unset: { tenantId: "" } }
      );

      console.log(`  ✅ ${collName}: removed tenantId from ${result.modifiedCount} document(s)`);
      totalRemoved += result.modifiedCount;
    } catch (err) {
      console.error(`  ❌ ${collName}: ${err.message}`);
      errors++;
    }
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`  Total documents updated : ${totalRemoved}`);
  console.log(`  Collections with errors : ${errors}`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected.");
  process.exit(errors > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("❌ Rollback failed:", err);
  process.exit(1);
});
