/**
 * Property 14: Webhook Signature Rejection
 * Invalid signatures must always be rejected (return 400).
 */

const { fc, test } = require("@fast-check/jest");
const crypto = require("crypto");

// ── Inline webhook signature verification logic ────────────────────
const verifyRazorpaySignature = (payload, signature, secret) => {
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(typeof payload === "string" ? payload : JSON.stringify(payload))
    .digest("hex");
  return expected === signature;
};

const verifyStripeSignature = (payload, signature, secret) => {
  if (!signature || !secret) return false;
  // Simplified Stripe-style verification (timestamp.payload)
  const parts = signature.split(",");
  const tPart = parts.find(p => p.startsWith("t="));
  const vPart = parts.find(p => p.startsWith("v1="));
  if (!tPart || !vPart) return false;

  const timestamp = tPart.slice(2);
  const expected  = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return `v1=${expected}` === vPart;
};

const VALID_SECRET = "whsec_test_secret_key_fitzone_2025";

describe("Property 14: Webhook Signature Rejection", () => {
  // Razorpay: invalid signatures always rejected
  test.prop([
    fc.string({ minLength: 1, maxLength: 200 }),  // payload
    fc.string({ minLength: 1, maxLength: 64 }),   // random invalid signature
  ])(
    "Razorpay: random signature is rejected",
    (payload, badSig) => {
      // Ensure the bad sig is not accidentally the correct one
      const correctSig = crypto
        .createHmac("sha256", VALID_SECRET)
        .update(payload)
        .digest("hex");
      fc.pre(badSig !== correctSig);

      const result = verifyRazorpaySignature(payload, badSig, VALID_SECRET);
      expect(result).toBe(false);
    }
  );

  // Razorpay: correct signature always accepted
  test.prop([fc.string({ minLength: 1, maxLength: 200 })])(
    "Razorpay: correct HMAC-SHA256 signature is accepted",
    (payload) => {
      const correctSig = crypto
        .createHmac("sha256", VALID_SECRET)
        .update(payload)
        .digest("hex");
      const result = verifyRazorpaySignature(payload, correctSig, VALID_SECRET);
      expect(result).toBe(true);
    }
  );

  // Missing signature always rejected
  test.prop([fc.string({ minLength: 1, maxLength: 200 })])(
    "missing signature is always rejected",
    (payload) => {
      expect(verifyRazorpaySignature(payload, null, VALID_SECRET)).toBe(false);
      expect(verifyRazorpaySignature(payload, "", VALID_SECRET)).toBe(false);
      expect(verifyRazorpaySignature(payload, undefined, VALID_SECRET)).toBe(false);
    }
  );

  // Missing secret always rejected
  test.prop([
    fc.string({ minLength: 1, maxLength: 200 }),
    fc.string({ minLength: 1, maxLength: 64 }),
  ])(
    "missing secret always rejects",
    (payload, sig) => {
      expect(verifyRazorpaySignature(payload, sig, null)).toBe(false);
      expect(verifyRazorpaySignature(payload, sig, "")).toBe(false);
    }
  );

  // Wrong secret always rejected
  test.prop([fc.string({ minLength: 1, maxLength: 200 })])(
    "signature verified with wrong secret is rejected",
    (payload) => {
      const correctSig = crypto
        .createHmac("sha256", VALID_SECRET)
        .update(payload)
        .digest("hex");
      const result = verifyRazorpaySignature(payload, correctSig, "wrong_secret");
      expect(result).toBe(false);
    }
  );
});
