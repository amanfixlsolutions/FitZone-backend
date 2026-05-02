/**
 * FitZone Database Seeder
 * Run: node utils/seeder.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: "fitZone" });
    console.log("✅ Connected to MongoDB");

    // ── Drop all collections cleanly ──────────────────────────────
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      await db.dropCollection(col.name).catch(() => {});
    }
    console.log("🗑️  Cleared all collections");

    // ── Hash passwords ─────────────────────────────────────────────
    const hashPwd = (pwd) => bcrypt.hash(pwd, 12);

    // ── Users ──────────────────────────────────────────────────────
    const Users = mongoose.model("User", new mongoose.Schema({}, { strict: false }), "users");

    const superAdminId = new mongoose.Types.ObjectId();
    const gymOwnerId   = new mongoose.Types.ObjectId();
    const memberId     = new mongoose.Types.ObjectId();
    const gymId        = new mongoose.Types.ObjectId();

    await Users.insertMany([
      {
        _id: superAdminId,
        name: "Rajiv Sharma", email: "superadmin@fitzone.in",
        password: await hashPwd("super@123"),
        role: "super-admin", avatar: "RS", phone: "+91 98765 00000",
        isEmailVerified: true, status: "active",
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        _id: gymOwnerId,
        name: "Suresh Nair", email: "admin@ironparadise.in",
        password: await hashPwd("admin@123"),
        role: "gym-owner", avatar: "SN", phone: "+91 98765 43210",
        gym: gymId, isEmailVerified: true, status: "active",
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        _id: memberId,
        name: "Rahul Sharma", email: "user@fitzone.in",
        password: await hashPwd("user@123"),
        role: "member", avatar: "RS", phone: "+91 98765 11001",
        plan: "Quarterly", isEmailVerified: true, status: "active",
        createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    console.log("✅ Users created (super-admin, gym-owner, member)");

    // ── Gym ────────────────────────────────────────────────────────
    const Gyms = mongoose.model("Gym", new mongoose.Schema({}, { strict: false }), "gyms");
    await Gyms.insertMany([{
      _id: gymId,
      name: "Iron Paradise Fitness",
      owner: gymOwnerId, ownerName: "Suresh Nair",
      email: "admin@ironparadise.in", phone: "+91 98765 43210",
      city: "Andheri, Mumbai",
      address: "123 Fitness Ave, Andheri West, Mumbai – 400058",
      description: "Premium fitness center with world-class equipment.",
      status: "active", commissionRate: 10,
      totalMembers: 2310, activeMembers: 2100,
      rating: 4.9, totalRatings: 450,
      docs: { submitted: true, verified: true },
      approvedAt: new Date(), approvedBy: superAdminId,
      createdAt: new Date(), updatedAt: new Date(),
    }]);
    console.log("✅ Gym created");

    // ── Plans ──────────────────────────────────────────────────────
    const Plans = mongoose.model("Plan", new mongoose.Schema({}, { strict: false }), "plans");
    const planIds = [
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
    ];
    await Plans.insertMany([
      { _id: planIds[0], gym: null, addedBy: superAdminId, name: "Basic",        price: 999,  duration: 1, unit: "Months", features: ["Gym Access", "Locker Room"],                                              color: "gray",    popular: false, active: true, totalSubscribers: 0, activeSubscribers: 0, createdAt: new Date(), updatedAt: new Date() },
      { _id: planIds[1], gym: null, addedBy: superAdminId, name: "Standard",     price: 1999, duration: 3, unit: "Months", features: ["All Basic", "Group Classes", "1 PT Session/mo"],                          color: "blue",    popular: false, active: true, totalSubscribers: 0, activeSubscribers: 0, createdAt: new Date(), updatedAt: new Date() },
      { _id: planIds[2], gym: null, addedBy: superAdminId, name: "Professional", price: 2999, duration: 6, unit: "Months", features: ["All Standard", "3 PT Sessions/mo", "Nutrition Plan", "Spa Access"],       color: "amber",   popular: true,  active: true, totalSubscribers: 0, activeSubscribers: 0, createdAt: new Date(), updatedAt: new Date() },
      { _id: planIds[3], gym: null, addedBy: superAdminId, name: "Family",       price: 4999, duration: 1, unit: "Years",  features: ["Up to 4 Members", "All Professional", "Priority Booking"],                color: "emerald", popular: false, active: true, totalSubscribers: 0, activeSubscribers: 0, createdAt: new Date(), updatedAt: new Date() },
    ]);
    console.log("✅ Plans created");

    // ── Trainers ───────────────────────────────────────────────────
    const Trainers = mongoose.model("Trainer", new mongoose.Schema({}, { strict: false }), "trainers");
    const trainerIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    await Trainers.insertMany([
      { _id: trainerIds[0], gym: gymId, addedBy: gymOwnerId, name: "Arjun Kapoor", email: "arjun@ironparadise.in", phone: "+91 98765 00001", specialty: "Strength & HIIT",   experience: "5 years", certification: "ACE Certified",  rating: 4.9, totalSessions: 142, totalClients: 28, status: "Active", available: true, createdAt: new Date(), updatedAt: new Date() },
      { _id: trainerIds[1], gym: gymId, addedBy: gymOwnerId, name: "Meera Nair",   email: "meera@ironparadise.in", phone: "+91 98765 00002", specialty: "Yoga & Meditation", experience: "7 years", certification: "RYT 500",        rating: 4.8, totalSessions: 98,  totalClients: 22, status: "Active", available: true, createdAt: new Date(), updatedAt: new Date() },
      { _id: trainerIds[2], gym: gymId, addedBy: gymOwnerId, name: "Divya Patel",  email: "divya@ironparadise.in", phone: "+91 98765 00003", specialty: "Zumba & Dance",     experience: "4 years", certification: "Zumba Certified", rating: 4.7, totalSessions: 176, totalClients: 40, status: "Active", available: true, createdAt: new Date(), updatedAt: new Date() },
      { _id: trainerIds[3], gym: gymId, addedBy: gymOwnerId, name: "Rohit Sharma", email: "rohit@ironparadise.in", phone: "+91 98765 00004", specialty: "Powerlifting",      experience: "6 years", certification: "CSCS",           rating: 4.9, totalSessions: 210, totalClients: 35, status: "Active", available: true, createdAt: new Date(), updatedAt: new Date() },
    ]);
    console.log("✅ Trainers created");

    // ── Classes ────────────────────────────────────────────────────
    const Classes = mongoose.model("Class", new mongoose.Schema({}, { strict: false }), "classes");
    await Classes.insertMany([
      { gym: gymId, addedBy: gymOwnerId, name: "Morning Yoga",      trainer: trainerIds[1], trainerName: "Meera Nair",   days: ["Mon","Wed","Fri"], startTime: "06:00", endTime: "07:00", capacity: 20, enrolled: 18, level: "All Levels",   status: "Active", isPaid: false, price: 0, createdAt: new Date(), updatedAt: new Date() },
      { gym: gymId, addedBy: gymOwnerId, name: "HIIT Blast",        trainer: trainerIds[0], trainerName: "Arjun Kapoor", days: ["Tue","Thu","Sat"], startTime: "07:00", endTime: "07:45", capacity: 20, enrolled: 15, level: "Advanced",     status: "Active", isPaid: false, price: 0, createdAt: new Date(), updatedAt: new Date() },
      { gym: gymId, addedBy: gymOwnerId, name: "Zumba Dance",       trainer: trainerIds[2], trainerName: "Divya Patel",  days: ["Mon","Wed","Fri"], startTime: "09:00", endTime: "10:00", capacity: 25, enrolled: 20, level: "Beginner",     status: "Active", isPaid: true,  price: 299, createdAt: new Date(), updatedAt: new Date() },
      { gym: gymId, addedBy: gymOwnerId, name: "Strength Training", trainer: trainerIds[3], trainerName: "Rohit Sharma", days: ["Mon","Tue","Wed","Thu","Fri"], startTime: "17:00", endTime: "18:00", capacity: 15, enrolled: 10, level: "Intermediate", status: "Active", isPaid: false, price: 0, createdAt: new Date(), updatedAt: new Date() },
    ]);
    console.log("✅ Classes created");

    // ── Members ────────────────────────────────────────────────────
    const Members = mongoose.model("Member", new mongoose.Schema({}, { strict: false }), "members");
    await Members.insertMany([
      { gym: gymId, addedBy: gymOwnerId, name: "Rahul Sharma",  email: "rahul@example.com",  phone: "+91 98765 11001", planName: "Professional", planPrice: 2999, status: "Active",  joinDate: new Date("2025-01-15"), expiryDate: new Date("2026-01-15"), totalCheckins: 142, createdAt: new Date(), updatedAt: new Date() },
      { gym: gymId, addedBy: gymOwnerId, name: "Priya Mehta",   email: "priya@example.com",  phone: "+91 98765 11002", planName: "Standard",     planPrice: 1999, status: "Active",  joinDate: new Date("2025-01-10"), expiryDate: new Date("2025-04-10"), totalCheckins: 89,  createdAt: new Date(), updatedAt: new Date() },
      { gym: gymId, addedBy: gymOwnerId, name: "Sneha Patel",   email: "sneha@example.com",  phone: "+91 98765 11003", planName: "Basic",        planPrice: 999,  status: "Paused",  joinDate: new Date("2024-12-01"), expiryDate: new Date("2025-01-01"), totalCheckins: 45,  createdAt: new Date(), updatedAt: new Date() },
      { gym: gymId, addedBy: gymOwnerId, name: "Vikram Singh",  email: "vikram@example.com", phone: "+91 98765 11004", planName: "Professional", planPrice: 2999, status: "Active",  joinDate: new Date("2025-01-20"), expiryDate: new Date("2026-01-20"), totalCheckins: 67,  createdAt: new Date(), updatedAt: new Date() },
      { gym: gymId, addedBy: gymOwnerId, name: "Neha Joshi",    email: "neha@example.com",   phone: "+91 98765 11005", planName: "Family",       planPrice: 4999, status: "Expired", joinDate: new Date("2024-01-01"), expiryDate: new Date("2025-01-01"), totalCheckins: 210, createdAt: new Date(), updatedAt: new Date() },
    ]);
    console.log("✅ Members created");

    // ── Settings ───────────────────────────────────────────────────
    const Settings = mongoose.model("Settings", new mongoose.Schema({}, { strict: false }), "settings");
    await Settings.insertMany([
      { gym: null, platform: { commissionRate: 10, maxPauseDays: 30, referralBonus: 500, trialDays: 7, maintenanceMode: false, allowRegistration: true }, createdAt: new Date(), updatedAt: new Date() },
      { gym: gymId, gym_settings: { gymName: "Iron Paradise Fitness", email: "admin@ironparadise.in", phone: "+91 98765 43210", currency: "INR", taxRate: 18, autoInvoice: true, autoReminder: true, reminderDays: 7 }, createdAt: new Date(), updatedAt: new Date() },
    ]);
    console.log("✅ Settings created");

    console.log("\n🎉 Database seeded successfully!\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Super Admin : superadmin@fitzone.in  /  super@123");
    console.log("  Gym Admin   : admin@ironparadise.in  /  admin@123");
    console.log("  Member      : user@fitzone.in        /  user@123");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
  } catch (err) {
    console.error("❌ Seeder error:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
};

seed();
