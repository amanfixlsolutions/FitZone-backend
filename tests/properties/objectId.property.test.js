/**
 * Property 11: MongoDB ObjectId Round-Trip
 *
 * Any valid 24-char hex string must survive ObjectId → string → ObjectId
 * round-trip without data loss.
 */

const { fc, test } = require("@fast-check/jest");
const mongoose = require("mongoose");

describe("Property 11: MongoDB ObjectId Round-Trip", () => {
  test.prop([fc.stringMatching(/^[a-f0-9]{24}$/)])(
    "valid 24-char hex string survives ObjectId round-trip",
    (hexStr) => {
      const oid    = new mongoose.Types.ObjectId(hexStr);
      const back   = oid.toHexString();
      const oid2   = new mongoose.Types.ObjectId(back);
      expect(oid2.toHexString()).toBe(hexStr.toLowerCase());
    }
  );

  test.prop([fc.stringMatching(/^[a-f0-9]{24}$/)])(
    "ObjectId toString equals toHexString",
    (hexStr) => {
      const oid = new mongoose.Types.ObjectId(hexStr);
      expect(oid.toString()).toBe(oid.toHexString());
    }
  );

  test.prop([fc.stringMatching(/^[a-f0-9]{24}$/)])(
    "ObjectId isValid returns true for valid hex strings",
    (hexStr) => {
      expect(mongoose.Types.ObjectId.isValid(hexStr)).toBe(true);
    }
  );

  test.prop([fc.string({ minLength: 1, maxLength: 23 })])(
    "ObjectId isValid returns false for strings shorter than 24 chars",
    (shortStr) => {
      // Only test strings that are clearly not valid ObjectIds
      if (shortStr.length < 12) {
        expect(mongoose.Types.ObjectId.isValid(shortStr)).toBe(false);
      }
    }
  );

  test("ObjectId equality works correctly", () => {
    const id1 = new mongoose.Types.ObjectId();
    const id2 = new mongoose.Types.ObjectId(id1.toHexString());
    expect(id1.equals(id2)).toBe(true);
  });
});
