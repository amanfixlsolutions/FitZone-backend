/**
 * Migration 005 — Create SaaSSubscription records for all active Gyms.
 * Run: node backend/migrations/005_add_saas_subscription.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error("❌ MONGO_URI not set."); process.exit(1); }

const mapStatus = (s) => ({ trial: "trial", active: "active", expired: "expired", cancelled: "cancelled" }[s] || "trial");

async function run() {
  console.log("🔗 Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected.\n");

  const db = mongoose.connection.db;
  const gymsCol = db.collection("gyms");
  const saasCol = db.collection("saassubscriptions");

  await saasCol.createIndex({ gym: 1 }, { unique: true, background: true });

  const gyms = await gymsCol.find({ status: "active" }).toArray();
  console.log(`Found ${gyms.length} active gym(s).\n`);

  let created = 0, skipped = 0, errors = 0;

  for (const gym of gyms) {
    try {
      const existing = await saasCol.findOne({ gym: gym._id });
      if (existing) { console.log(`  ⏭  ${gym.name}: already exists`); skipped++; continue; }

      const sub = gym.subscription || {};
      const now = new Date();
      await saasCol.insertOne({
        gym: gym._id, gymName: gym.name || "",
        tier: gym.subscriptionTier || "starter",
        status: mapStatus(sub.status),
        billingCycle: sub.billingCycle || "monthly",
        trialStartedAt: sub.trialStartedAt || null,
        trialEndsAt: gym.trialEndsAt || null,
        trialDays: 14,
        currentPeriodStart: sub.startDate || null,
        currentPeriodEnd: sub.expiryDate || null,
        nextBillingDate: sub.expiryDate || null,
        amount: sub.lastPaymentAmount || 0,
        currency: "INR",
        lastPaymentId: sub.lastPaymentId || "",
        lastPaymentAmount: sub.lastPaymentAmount || 0,
        lastPaidAt: sub.lastPaidAt || null,
        paymentGateway: "",
        gracePeriodEndsAt: sub.gracePeriodEndsAt || null,
        dunningStep: sub.dunningStep || 0,
        dunningStartedAt: null, nextDunningAt: null,
        cancelledAt: null, cancelReason: "",
        createdAt: now, updatedAt: now,
      });
      console.log(`  ✅ ${gym.name}: created`);
      created++;
    } catch (err) {
      console.error(`  ❌ ${gym.name}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n── Summary ──\n  Created: ${created}  Skipped: ${skipped}  Errors: ${errors}`);
  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

run().catch(err => { console.error("❌ Migration failed:", err); process.exit(1); });
