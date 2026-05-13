/**
 * Rollback 002 — Remove the slug field from all Gym documents.
 *
 * Run: node backend/migrations/rollback/002_rollback.js
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

  const db   = mongoose.connection.db;
  const gyms = db.collection("gyms");

  // Count documents that have a slug
  const total = await gyms.countDocuments({ slug: { $exists: true } });
  console.log(`📋 Found ${total} gym(s) with a slug field.`);

  if (total === 0) {
    console.log("   Nothing to roll back.");
    await mongoose.disconnect();
    console.log("🔌 Disconnected.");
    process.exit(0);
  }

  const result = await gyms.updateMany(
    { slug: { $exists: true } },
    { $unset: { slug: "" } }
  );

  console.log(`✅ Removed slug from ${result.modifiedCount} gym document(s).`);

  // Also drop the slug index if it exists
  try {
    const indexes = await gyms.indexes();
    const slugIdx = indexes.find((i) => i.key && i.key.slug !== undefined);
    if (slugIdx) {
      await gyms.dropIndex(slugIdx.name);
      console.log(`✅ Dropped slug index "${slugIdx.name}".`);
    }
  } catch (err) {
    console.warn(`⚠️  Could not drop slug index: ${err.message}`);
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`  Gyms updated : ${result.modifiedCount}`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Rollback failed:", err);
  process.exit(1);
});
