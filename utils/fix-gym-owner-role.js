/**
 * Fix gym-owner role in DB
 * Run: node utils/fix-gym-owner-role.js
 *
 * This script finds users who own a gym but have role "member"
 * and corrects their role to "gym-owner".
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI, { dbName: "fitZone" }).then(async () => {
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const gyms  = db.collection("gyms");

  console.log("🔍 Checking user roles...\n");

  // Find all gyms and their owners
  const allGyms = await gyms.find({}).toArray();
  console.log(`Found ${allGyms.length} gym(s)`);

  let fixed = 0;
  for (const gym of allGyms) {
    if (!gym.owner) continue;
    const user = await users.findOne({ _id: gym.owner });
    if (!user) continue;

    console.log(`  Gym: ${gym.name} | Owner: ${user.email} | Role: ${user.role}`);

    if (user.role !== "gym-owner") {
      await users.updateOne(
        { _id: user._id },
        { $set: { role: "gym-owner", gym: gym._id } }
      );
      console.log(`  ✅ Fixed: ${user.email} → gym-owner`);
      fixed++;
    }
  }

  // Also show all users
  console.log("\n📋 All users:");
  const allUsers = await users.find({}).toArray();
  for (const u of allUsers) {
    console.log(`  ${u.email} | role: ${u.role} | status: ${u.status}`);
  }

  console.log(`\n✅ Done. Fixed ${fixed} user(s).`);
  process.exit(0);
}).catch(e => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
