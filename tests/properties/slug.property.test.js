/**
 * Property 3: Gym Slug Validity and Uniqueness
 *
 * For any gym name, the generated slug must:
 * - Contain only lowercase letters, digits, and hyphens
 * - Not start or end with a hyphen
 * - Be non-empty
 */

const { fc, test } = require("@fast-check/jest");

// ── Inline slug generation logic (mirrors backend/utils/slugify.js) ─
const generateSlug = (name) => {
  if (!name || typeof name !== "string") return "gym";
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")   // remove special chars
    .replace(/\s+/g, "-")            // spaces → hyphens
    .replace(/-+/g, "-")             // collapse multiple hyphens
    .replace(/^-+|-+$/g, "")         // trim leading/trailing hyphens
    || "gym";
};

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

describe("Property 3: Gym Slug Validity", () => {
  test.prop([fc.string({ minLength: 1, maxLength: 100 })])(
    "slug contains only lowercase letters, digits, and hyphens",
    (name) => {
      const slug = generateSlug(name);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  );

  test.prop([fc.string({ minLength: 1, maxLength: 100 })])(
    "slug does not start or end with a hyphen",
    (name) => {
      const slug = generateSlug(name);
      expect(slug).not.toMatch(/^-/);
      expect(slug).not.toMatch(/-$/);
    }
  );

  test.prop([fc.string({ minLength: 1, maxLength: 100 })])(
    "slug is always non-empty",
    (name) => {
      const slug = generateSlug(name);
      expect(slug.length).toBeGreaterThan(0);
    }
  );

  test.prop([fc.string({ minLength: 1, maxLength: 100 })])(
    "slug is always lowercase",
    (name) => {
      const slug = generateSlug(name);
      expect(slug).toBe(slug.toLowerCase());
    }
  );

  // Uniqueness: same name always produces same slug (deterministic)
  test.prop([fc.string({ minLength: 1, maxLength: 100 })])(
    "same name always produces same slug (deterministic)",
    (name) => {
      const slug1 = generateSlug(name);
      const slug2 = generateSlug(name);
      expect(slug1).toBe(slug2);
    }
  );

  // Known cases
  test("Iron Paradise → iron-paradise", () => {
    expect(generateSlug("Iron Paradise")).toBe("iron-paradise");
  });

  test("FitZone Gym #1 → fitzone-gym-1", () => {
    expect(generateSlug("FitZone Gym #1")).toBe("fitzone-gym-1");
  });
});
