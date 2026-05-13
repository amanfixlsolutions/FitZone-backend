/**
 * slugify.js — URL-safe slug generation with uniqueness enforcement.
 * Converts a gym name to a lowercase, hyphen-separated slug and ensures
 * uniqueness in the Gym collection by appending a numeric suffix on collision.
 */

const Gym = require("../models/Gym");

/**
 * Convert a string to a URL-safe slug.
 * - Lowercases the string
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses multiple consecutive hyphens into one
 * - Trims leading and trailing hyphens
 *
 * @param {string} name - The input string to slugify
 * @returns {string} The base slug
 */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")   // replace non-alphanumeric runs with a single hyphen
    .replace(/-+/g, "-")            // collapse multiple hyphens (belt-and-suspenders)
    .replace(/^-+|-+$/g, "");       // trim leading/trailing hyphens
}

/**
 * Generate a unique slug for a gym name.
 * Checks the Gym collection for existing slugs and appends -2, -3, etc. on collision.
 *
 * @param {string} name - The gym name to slugify
 * @param {string|null} [excludeId=null] - Optional Gym _id to exclude from uniqueness check
 *                                         (useful when updating an existing gym)
 * @returns {Promise<string>} A unique slug
 */
async function generateUniqueSlug(name, excludeId = null) {
  const base = toSlug(name);

  if (!base) {
    // Fallback for names that produce an empty slug (e.g. all special chars)
    const fallback = `gym-${Date.now()}`;
    return fallback;
  }

  // Check if the base slug is available
  const query = { slug: base };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await Gym.findOne(query).select("_id").lean();
  if (!existing) return base;

  // Collision — try numeric suffixes: base-2, base-3, …
  let counter = 2;
  while (true) {
    const candidate = `${base}-${counter}`;
    const suffixQuery = { slug: candidate };
    if (excludeId) suffixQuery._id = { $ne: excludeId };

    const conflict = await Gym.findOne(suffixQuery).select("_id").lean();
    if (!conflict) return candidate;
    counter++;
  }
}

module.exports = { toSlug, generateUniqueSlug };
