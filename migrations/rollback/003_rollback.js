/**
 * Rollback 003 — Delete all TenantConfig documents.
 *
 * WARNING: This is destructive. All per-tenant configuration (feature flags,
 * limits, branding) will be permanently deleted.
 *
 * Run: node backend/migrations/rollback/003_rollback.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set in environment.");
  process.exit(1);
}

async function run() {
  console.log("🔗 Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected.\n");

  const db            = mongoose.connection.db;
  const tenantConfigs = db.collection("tenantconfigs");

  const total = await tenantConfigs.countDocuments({});
  console.log(`📋 Found ${total} TenantConfig document(s).`);

  if (total === 0) {
    console.log("   Nothing to roll back.");
    await mongoose.disconnect();
    console.log("🔌 Disconnected.");
    process.exit(0);
  }

  const result = await tenantConfigs.deleteMany({});
  console.log(`✅ Deleted ${result.deletedCount} TenantConfig document(s).`);

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`  Deleted : ${result.deletedCount}`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Rollback failed:", err);
  process.exit(1);
});
