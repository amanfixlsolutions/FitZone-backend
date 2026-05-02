/**
 * Fix plain-text passwords in DB — run once
 * node utils/fix-passwords.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected to MongoDB");

  const users = mongoose.connection.db.collection("users");

  const accounts = [
    { email: "superadmin@fitzone.in", password: "super@123" },
    { email: "admin@ironparadise.in", password: "admin@123" },
    { email: "user@fitzone.in",       password: "user@123"  },
  ];

  for (const acc of accounts) {
    const hashed = await bcrypt.hash(acc.password, 12);
    const result = await users.updateOne(
      { email: acc.email },
      { $set: { password: hashed } }
    );
    if (result.matchedCount === 0) {
      console.log(`❌ User not found: ${acc.email}`);
    } else {
      console.log(`✅ Password hashed for: ${acc.email}`);
    }
  }

  // Verify all 3
  console.log("\n── Verification ──");
  for (const acc of accounts) {
    const user = await users.findOne({ email: acc.email });
    if (!user) { console.log(`❌ ${acc.email} — NOT FOUND`); continue; }
    const ok = await bcrypt.compare(acc.password, user.password);
    console.log(`${ok ? "✅" : "❌"} ${acc.email} — bcrypt check: ${ok ? "PASS" : "FAIL"}`);
  }

  console.log("\n🎉 Done! Try logging in now.\n");
  process.exit(0);
};

run().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
