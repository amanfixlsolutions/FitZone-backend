/**
 * Migration 001 — Add compound tenant indexes to all tenant-scoped collections.
 *
 * Creates:
 *   { gym: 1, createdAt: -1 } on all tenant-scoped collections
 *   { gym: 1, status: 1 }     on Member, Payment, Class, Trainer
 *
 * Run: node backend/migrations/001_add_tenant_indexes.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set in environment.");
  process.exit(1);
}

// Collections that need { gym: 1, createdAt: -1 }
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

// Collections that additionally need { gym: 1, status: 1 }
const STATUS_COLLECTIONS = ["members", "payments", "classes", "trainers"];

async function run() {
  console.log("🔗 Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected.");

  const db = mongoose.connection.db;
  const results = { created: [], skipped: [], errors: [] };

  // ── { gym: 1, createdAt: -1 } ──────────────────────────────────
  for (const collName of TENANT_COLLECTIONS) {
    try {
      const coll = db.collection(collName);
      await coll.createIndex({ gym: 1, createdAt: -1 }, { background: true });
      console.log(`  ✅ ${collName}: { gym: 1, createdAt: -1 }`);
      results.created.push(`${collName}: { gym: 1, createdAt: -1 }`);
    } catch (err) {
      if (err.code === 85 || err.code === 86 || err.message.includes("already exists")) {
        console.log(`  ⏭  ${collName}: { gym: 1, createdAt: -1 } — already exists`);
        results.skipped.push(`${collName}: { gym: 1, createdAt: -1 }`);
      } else {
        console.error(`  ❌ ${collName}: ${err.message}`);
        results.errors.push(`${collName}: ${err.message}`);
      }
    }
  }

  // ── { gym: 1, status: 1 } ─────────────────────────────────────
  for (const collName of STATUS_COLLECTIONS) {
    try {
      const coll = db.collection(collName);
      await coll.createIndex({ gym: 1, status: 1 }, { background: true });
      console.log(`  ✅ ${collName}: { gym: 1, status: 1 }`);
      results.created.push(`${collName}: { gym: 1, status: 1 }`);
    } catch (err) {
      if (err.code === 85 || err.code === 86 || err.message.includes("already exists")) {
        console.log(`  ⏭  ${collName}: { gym: 1, status: 1 } — already exists`);
        results.skipped.push(`${collName}: { gym: 1, status: 1 }`);
      } else {
        console.error(`  ❌ ${collName}: ${err.message}`);
        results.errors.push(`${collName}: ${err.message}`);
      }
    }
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`  Created : ${results.created.length}`);
  console.log(`  Skipped : ${results.skipped.length}`);
  console.log(`  Errors  : ${results.errors.length}`);
  if (results.errors.length > 0) {
    console.error("  Error details:", results.errors);
  }

  await mongoose.disconnect();
  console.log("🔌 Disconnected.");
  process.exit(results.errors.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
