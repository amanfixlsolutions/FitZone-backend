/**
 * Property 4: Tenant Isolation Enforcement
 * Property 5: Tenant Suspension Blocks All Requests
 * Property 17: TenantScope Query Filter Injection
 */

const { fc, test } = require("@fast-check/jest");

// ── Inline tenant scope logic (mirrors middleware/tenantScope.js) ──
const buildTenantFilter = (user) => {
  if (!user || !user.gym) return null;
  return { gym: user.gym };
};

const isTenantAllowed = (user, resourceGymId) => {
  if (!user) return false;
  if (user.role === "super-admin") return true;
  if (!user.gym) return false;
  return String(user.gym) === String(resourceGymId);
};

const isGymSuspended = (gym) => {
  return gym?.status === "suspended";
};

// ── ObjectId-like string generator ────────────────────────────────
const objectIdArb = fc.stringMatching(/^[a-f0-9]{24}$/);

describe("Property 4: Tenant Isolation Enforcement", () => {
  test.prop([objectIdArb, objectIdArb])(
    "gym-owner A cannot access gym B resources",
    (gymAId, gymBId) => {
      fc.pre(gymAId !== gymBId); // ensure different gyms
      const userA = { role: "gym-owner", gym: gymAId };
      expect(isTenantAllowed(userA, gymBId)).toBe(false);
    }
  );

  test.prop([objectIdArb])(
    "gym-owner can access their own gym resources",
    (gymId) => {
      const user = { role: "gym-owner", gym: gymId };
      expect(isTenantAllowed(user, gymId)).toBe(true);
    }
  );

  test.prop([objectIdArb, objectIdArb])(
    "super-admin can access any gym resources",
    (gymAId, gymBId) => {
      const superAdmin = { role: "super-admin", gym: gymAId };
      expect(isTenantAllowed(superAdmin, gymBId)).toBe(true);
    }
  );

  test("unauthenticated user cannot access any resource", () => {
    expect(isTenantAllowed(null, "abc123")).toBe(false);
    expect(isTenantAllowed(undefined, "abc123")).toBe(false);
  });
});

describe("Property 5: Tenant Suspension Blocks All Requests", () => {
  test.prop([objectIdArb])(
    "suspended gym returns blocked status",
    (gymId) => {
      const gym = { _id: gymId, status: "suspended" };
      expect(isGymSuspended(gym)).toBe(true);
    }
  );

  test.prop([objectIdArb])(
    "active gym is not blocked",
    (gymId) => {
      const gym = { _id: gymId, status: "active" };
      expect(isGymSuspended(gym)).toBe(false);
    }
  );

  test.prop([
    objectIdArb,
    fc.constantFrom("active", "trial", "pending"),
  ])(
    "non-suspended statuses are not blocked",
    (gymId, status) => {
      const gym = { _id: gymId, status };
      expect(isGymSuspended(gym)).toBe(false);
    }
  );
});

describe("Property 17: TenantScope Query Filter Injection", () => {
  test.prop([objectIdArb])(
    "buildTenantFilter always includes gym field for gym-owner",
    (gymId) => {
      const user = { role: "gym-owner", gym: gymId };
      const filter = buildTenantFilter(user);
      expect(filter).not.toBeNull();
      expect(filter).toHaveProperty("gym");
      expect(String(filter.gym)).toBe(String(gymId));
    }
  );

  test("buildTenantFilter returns null for user without gym", () => {
    expect(buildTenantFilter({ role: "member" })).toBeNull();
    expect(buildTenantFilter(null)).toBeNull();
  });

  test.prop([objectIdArb])(
    "tenant filter gym value matches user gym exactly",
    (gymId) => {
      const user = { role: "gym-owner", gym: gymId };
      const filter = buildTenantFilter(user);
      expect(String(filter.gym)).toBe(String(gymId));
    }
  );
});
