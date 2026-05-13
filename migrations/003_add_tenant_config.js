/**
 * Migration 003 — Create TenantConfig documents for all existing Gyms that don't have one.
 *
 * Feature flag defaults by subscription tier:
 *   starter    — basic features only (no live_classes, zoom, campaigns, analytics_advanced, api_access)
 *   growth     — all features enabled
 *   enterprise — all features enabled
 *
 * Run: node backend/migrations/003_add_tenant_config.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set in environment.");
  process.exit(1);
}

/**
 * Build feature flags based on subscription tier.
 * @param {string} tier - "starter" | "growth" | "enterprise"
 * @returns {object}
 */
function buildFeatureFlags(tier) {
  const isAdvanced = tier === "growth" || tier === "enterprise";
  return {
    member_self_registration: isAdvanced,
    live_classes:             isAdvanced,
    zoom_integration:         isAdvanced,
    campaigns:                isAdvanced,
    inventory:                true,          // all tiers get inventory
    analytics_advanced:       tier === "enterprise",
    api_access:               tier === "enterprise",
  };
}

async function run() {
  console.log("🔗 Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected.");

  const Gym          = require("../models/Gym");
  const TenantConfig = require("../models/TenantConfig");

  // Find all gyms
  const gyms = await Gym.find({}).select("_id name subscriptionTier").lean();
  console.log(`\n📋 Found ${gyms.length} gym(s) total.`);

  // Find gyms that already have a TenantConfig
  const existingConfigs = await TenantConfig.find({}).select("gym").lean();
  const existingGymIds  = new Set(existingConfigs.map((c) => c.gym.toString()));

  const gymsToProcess = gyms.filter((g) => !existingGymIds.has(g._id.toString()));
  console.log(`   ${existingGymIds.size} already have TenantConfig — skipping.`);
  console.log(`   ${gymsToProcess.length} need TenantConfig creation.`);

  let created = 0;
  let errors  = 0;

  for (const gym of gymsToProcess) {
    try {
      const tier         = gym.subscriptionTier || "starter";
      const featureFlags = buildFeatureFlags(tier);

      await TenantConfig.create({
        gym:          gym._id,
        featureFlags,
        limits: {
          maxMembers:  tier === "enterprise" ? 10000 : tier === "growth" ? 500 : 100,
          maxTrainers: tier === "enterprise" ? 100   : tier === "growth" ? 25  : 10,
          storageGB:   tier === "enterprise" ? 50    : tier === "growth" ? 20  : 5,
        },
      });

      console.log(`  ✅ "${gym.name}" (tier: ${tier}) — TenantConfig created`);
      created++;
    } catch (err) {
      // Duplicate key = already exists (race condition) — treat as skip
      if (err.code === 11000) {
        console.log(`  ⏭  "${gym.name}" — TenantConfig already exists (duplicate key)`);
      } else {
        console.error(`  ❌ "${gym.name}" (${gym._id}): ${err.message}`);
        errors++;
      }
    }
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`  Created : ${created}`);
  console.log(`  Skipped : ${existingGymIds.size}`);
  console.log(`  Errors  : ${errors}`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected.");
  process.exit(errors > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
