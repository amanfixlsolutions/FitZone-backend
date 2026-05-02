/**
 * Fix gym-owner's gym reference in DB
 * node utils/fix-gym-owner.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI, { dbName: "fitZone" }).then(async () => {
  const db    = mongoose.connection.db;
  const users = db.collection("users");
  const gyms  = db.collection("gyms");

  // Find the gym
  const gym = await gyms.findOne({});
  if (!gym) { console.log("❌ No gym found in DB. Run seeder first."); process.exit(1); }
  console.log("✅ Found gym:", gym.name, "| _id:", gym._id);

  // Update gym-owner's gym field
  const result = await users.updateOne(
    { role: "gym-owner" },
    { $set: { gym: gym._id } }
  );
  console.log("✅ Updated gym-owner gym field. Modified:", result.modifiedCount);

  // Verify
  const owner = await users.findOne({ role: "gym-owner" });
  console.log("✅ Gym-owner:", owner.email, "| gym:", owner.gym);

  process.exit(0);
}).catch(e => { console.error("❌", e.message); process.exit(1); });
