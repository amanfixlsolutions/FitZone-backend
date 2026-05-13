/**
 * Migration 002 — Generate slugs for all existing Gym documents that don't have one.
 *
 * Uses the slugify utility to produce URL-safe, unique slugs.
 * Skips gyms that already have a slug set.
 *
 * Run: node backend/migrations/002_add_gym_slug.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set in environment.");
  process.exit(1);
}

async function run() {
  console.log("🔗 Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected.");

  // Require models AFTER connecting so Mongoose registers them properly
  const Gym = require("../models/Gym");
  const { generateUniqueSlug } = require("../utils/slugify");

  const gyms = await Gym.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] })
    .select("_id name slug")
    .lean();

  console.log(`\n📋 Found ${gyms.length} gym(s) without a slug.`);

  let updated = 0;
  let skipped = 0;
  let errors  = 0;

  for (const gym of gyms) {
    try {
      const slug = await generateUniqueSlug(gym.name, gym._id);
      await Gym.findByIdAndUpdate(gym._id, { slug });
      console.log(`  ✅ "${gym.name}" → "${slug}"`);
      updated++;
    } catch (err) {
      console.error(`  ❌ "${gym.name}" (${gym._id}): ${err.message}`);
      errors++;
    }
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errors  : ${errors}`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected.");
  process.exit(errors > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
