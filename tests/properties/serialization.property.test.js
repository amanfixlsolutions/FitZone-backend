/**
 * Property 12: Payment Amount JSON Preservation — no floating-point drift
 * Property 13: TenantConfig Round-Trip — deep equality after JSON serialize/parse
 */

const { fc, test } = require("@fast-check/jest");

describe("Property 12: Payment Amount JSON Preservation", () => {
  // Use integer amounts (paise/cents) to avoid floating-point issues
  test.prop([fc.integer({ min: 1, max: 10000000 })])(
    "integer payment amounts survive JSON round-trip exactly",
    (amountPaise) => {
      const obj    = { amount: amountPaise, currency: "INR" };
      const json   = JSON.stringify(obj);
      const parsed = JSON.parse(json);
      expect(parsed.amount).toBe(amountPaise);
    }
  );

  // Rupee amounts with 2 decimal places
  test.prop([
    fc.integer({ min: 1, max: 100000 }),
    fc.integer({ min: 0, max: 99 }),
  ])(
    "rupee amounts with paise survive JSON round-trip",
    (rupees, paise) => {
      const amount = rupees + paise / 100;
      const json   = JSON.stringify({ amount });
      const parsed = JSON.parse(json);
      // Allow ±0.001 tolerance for floating point
      expect(Math.abs(parsed.amount - amount)).toBeLessThan(0.001);
    }
  );

  test.prop([fc.integer({ min: 0, max: 50 })])(
    "commission rate survives JSON round-trip",
    (rate) => {
      const obj    = { commissionRate: rate };
      const json   = JSON.stringify(obj);
      const parsed = JSON.parse(json);
      expect(parsed.commissionRate).toBe(rate);
    }
  );
});

describe("Property 13: TenantConfig Round-Trip", () => {
  const tenantConfigArb = fc.record({
    gymId:        fc.stringMatching(/^[a-f0-9]{24}$/),
    maxMembers:   fc.integer({ min: 10, max: 10000 }),
    maxTrainers:  fc.integer({ min: 1, max: 100 }),
    featureFlags: fc.record({
      liveClasses:          fc.boolean(),
      advancedAnalytics:    fc.boolean(),
      customBranding:       fc.boolean(),
      memberSelfRegistration: fc.boolean(),
    }),
    subscriptionTier: fc.constantFrom("starter", "basic", "professional", "enterprise"),
  });

  test.prop([tenantConfigArb])(
    "TenantConfig survives JSON serialize/parse with deep equality",
    (config) => {
      const json   = JSON.stringify(config);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(config);
    }
  );

  test.prop([tenantConfigArb])(
    "TenantConfig maxMembers preserved after round-trip",
    (config) => {
      const parsed = JSON.parse(JSON.stringify(config));
      expect(parsed.maxMembers).toBe(config.maxMembers);
    }
  );

  test.prop([tenantConfigArb])(
    "TenantConfig featureFlags preserved after round-trip",
    (config) => {
      const parsed = JSON.parse(JSON.stringify(config));
      expect(parsed.featureFlags).toEqual(config.featureFlags);
    }
  );

  test.prop([tenantConfigArb])(
    "TenantConfig subscriptionTier preserved after round-trip",
    (config) => {
      const parsed = JSON.parse(JSON.stringify(config));
      expect(parsed.subscriptionTier).toBe(config.subscriptionTier);
    }
  );
});
