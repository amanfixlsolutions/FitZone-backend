const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI, { dbName: "fitZone" }).then(async () => {
  const users = mongoose.connection.db.collection("users");

  // Fix role field — old seeder saved "superadmin" without hyphen
  const r = await users.updateOne(
    { email: "superadmin@fitzone.in" },
    { $set: { role: "super-admin" } }
  );
  console.log("Fixed super-admin role, modified:", r.modifiedCount);

  // Verify all roles
  const all = await users.find({}).toArray();
  for (const u of all) {
    console.log(`  ${u.email} | role: ${u.role} | status: ${u.status}`);
  }

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
