/**
 * Property 16: Migration Non-Destructive
 * All original fields must be preserved after migration (additive-only changes).
 */

const { fc, test } = require("@fast-check/jest");

// ── Inline migration logic (mirrors migrations/004_add_tenant_id.js) ─
const applyTenantIdMigration = (doc) => {
  // Migration only ADDS tenantId — never removes or modifies existing fields
  const migrated = { ...doc };
  if (migrated.gym && !migrated.tenantId) {
    migrated.tenantId = migrated.gym;
  }
  return migrated;
};

const applySlugMigration = (gym) => {
  // Migration only ADDS slug — never removes or modifies existing fields
  const migrated = { ...gym };
  if (!migrated.slug && migrated.name) {
    migrated.slug = migrated.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "gym";
  }
  return migrated;
};

// ── Arbitrary document generators ─────────────────────────────────
const gymDocArb = fc.record({
  _id:    fc.stringMatching(/^[a-f0-9]{24}$/),
  name:   fc.string({ minLength: 1, maxLength: 50 }),
  city:   fc.string({ minLength: 1, maxLength: 30 }),
  status: fc.constantFrom("active", "pending", "suspended"),
  owner:  fc.stringMatching(/^[a-f0-9]{24}$/),
});

const memberDocArb = fc.record({
  _id:    fc.stringMatching(/^[a-f0-9]{24}$/),
  name:   fc.string({ minLength: 1, maxLength: 50 }),
  email:  fc.emailAddress(),
  gym:    fc.stringMatching(/^[a-f0-9]{24}$/),
  status: fc.constantFrom("Active", "Expired", "Paused", "Banned"),
});

describe("Property 16: Migration Non-Destructive", () => {
  test.prop([memberDocArb])(
    "tenantId migration preserves all original member fields",
    (doc) => {
      const migrated = applyTenantIdMigration(doc);
      // All original fields must still be present
      for (const [key, value] of Object.entries(doc)) {
        expect(migrated[key]).toEqual(value);
      }
    }
  );

  test.prop([memberDocArb])(
    "tenantId migration only adds tenantId — no other new fields",
    (doc) => {
      const migrated = applyTenantIdMigration(doc);
      const originalKeys = new Set(Object.keys(doc));
      const migratedKeys = new Set(Object.keys(migrated));

      // Only allowed new key is tenantId
      for (const key of migratedKeys) {
        if (!originalKeys.has(key)) {
          expect(key).toBe("tenantId");
        }
      }
    }
  );

  test.prop([memberDocArb])(
    "tenantId equals gym after migration",
    (doc) => {
      const migrated = applyTenantIdMigration(doc);
      if (doc.gym) {
        expect(migrated.tenantId).toBe(doc.gym);
      }
    }
  );

  test.prop([gymDocArb])(
    "slug migration preserves all original gym fields",
    (gym) => {
      const migrated = applySlugMigration(gym);
      for (const [key, value] of Object.entries(gym)) {
        expect(migrated[key]).toEqual(value);
      }
    }
  );

  test.prop([gymDocArb])(
    "slug migration only adds slug — no other new fields",
    (gym) => {
      const migrated = applySlugMigration(gym);
      const originalKeys = new Set(Object.keys(gym));
      const migratedKeys = new Set(Object.keys(migrated));

      for (const key of migratedKeys) {
        if (!originalKeys.has(key)) {
          expect(key).toBe("slug");
        }
      }
    }
  );

  test("migration is idempotent — running twice produces same result", () => {
    const doc = { _id: "abc123def456abc123def456", name: "Test", gym: "gym123def456gym123def456" };
    const once  = applyTenantIdMigration(doc);
    const twice = applyTenantIdMigration(once);
    expect(twice).toEqual(once);
  });
});
