/**
 * Create all demo users with hashed passwords
 * node utils/create-users.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: "fitZone" });
  console.log("✅ Connected to MongoDB");

  const db    = mongoose.connection.db;
  const users = db.collection("users");
  const gyms  = db.collection("gyms");

  // Get gym ID for gym-owner
  const gym = await gyms.findOne({ name: "Iron Paradise Fitness" });
  const gymId = gym?._id || null;
  console.log("Gym found:", gym ? gym.name : "NOT FOUND — gym-owner will have no gym ref");

  const accounts = [
    {
      email: "superadmin@fitzone.in", password: "super@123",
      name: "Rajiv Sharma", role: "super-admin", avatar: "RS",
      phone: "+91 98765 00000", gym: null,
    },
    {
      email: "admin@ironparadise.in", password: "admin@123",
      name: "Suresh Nair", role: "gym-owner", avatar: "SN",
      phone: "+91 98765 43210", gym: gymId,
    },
    {
      email: "user@fitzone.in", password: "user@123",
      name: "Rahul Sharma", role: "member", avatar: "RS",
      phone: "+91 98765 11001", gym: null, plan: "Quarterly",
    },
  ];

  for (const acc of accounts) {
    const existing = await users.findOne({ email: acc.email });
    const hashed   = await bcrypt.hash(acc.password, 12);

    if (existing) {
      // Update password only
      await users.updateOne({ email: acc.email }, { $set: { password: hashed } });
      console.log(`✅ Updated password: ${acc.email}`);
    } else {
      // Insert new user
      await users.insertOne({
        name:            acc.name,
        email:           acc.email,
        password:        hashed,
        role:            acc.role,
        avatar:          acc.avatar,
        phone:           acc.phone,
        gym:             acc.gym,
        plan:            acc.plan || "",
        isEmailVerified: true,
        status:          "active",
        lastLogin:       null,
        createdAt:       new Date(),
        updatedAt:       new Date(),
      });
      console.log(`✅ Created user: ${acc.email}`);
    }
  }

  // Final verification
  console.log("\n── Verification ──");
  for (const acc of accounts) {
    const user = await users.findOne({ email: acc.email });
    if (!user) { console.log(`❌ ${acc.email} — NOT FOUND`); continue; }
    const ok = await bcrypt.compare(acc.password, user.password);
    console.log(`${ok ? "✅" : "❌"} ${acc.email} | role: ${user.role} | bcrypt: ${ok ? "PASS" : "FAIL"}`);
  }

  console.log("\n🎉 All users ready! You can now log in.\n");
  console.log("  superadmin@fitzone.in  /  super@123  →  /super-admin");
  console.log("  admin@ironparadise.in  /  admin@123  →  /gym-owner");
  console.log("  user@fitzone.in        /  user@123   →  /\n");

  process.exit(0);
};

run().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
