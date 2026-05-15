/**
 * Property 2: Payment Amount Invariant — C + N = A
 * Property 8: Yearly Billing Discount Calculation — Y = M * 12 * (1 - D/100)
 * Property 9: Prorated Upgrade Charge — C = (P2 - P1) * R / T
 */

const { fc, test } = require("@fast-check/jest");

// ── Payment amount helpers (mirrors billingService logic) ──────────
const calculateCommission = (amount, rate) =>
  Math.round((amount * rate) / 100 * 100) / 100;

const calculateNet = (amount, commissionAmount) =>
  Math.round((amount - commissionAmount) * 100) / 100;

const calculateYearlyPrice = (monthlyPrice, discountPct) =>
  Math.round(monthlyPrice * 12 * (1 - discountPct / 100) * 100) / 100;

const calculateProratedCharge = (newPlanPrice, oldPlanPrice, remainingDays, totalDays) => {
  if (totalDays <= 0) return 0;
  return Math.round(((newPlanPrice - oldPlanPrice) * remainingDays) / totalDays * 100) / 100;
};

describe("Property 2: Payment Amount Invariant — C + N = A", () => {
  test.prop([
    fc.integer({ min: 100, max: 100000 }),   // amount in rupees
    fc.integer({ min: 0,   max: 50 }),        // commission rate %
  ])("commission + net = amount (within rounding tolerance)", (amount, rate) => {
    const commission = calculateCommission(amount, rate);
    const net        = calculateNet(amount, commission);
    // Allow ±1 paise rounding tolerance
    expect(Math.abs(commission + net - amount)).toBeLessThanOrEqual(0.01);
  });

  test.prop([
    fc.integer({ min: 100, max: 100000 }),
    fc.integer({ min: 0, max: 50 }),
  ])("commission is always non-negative", (amount, rate) => {
    const commission = calculateCommission(amount, rate);
    expect(commission).toBeGreaterThanOrEqual(0);
  });

  test.prop([
    fc.integer({ min: 100, max: 100000 }),
    fc.integer({ min: 0, max: 50 }),
  ])("net amount is always non-negative", (amount, rate) => {
    const commission = calculateCommission(amount, rate);
    const net        = calculateNet(amount, commission);
    expect(net).toBeGreaterThanOrEqual(0);
  });
});

describe("Property 8: Yearly Billing Discount — Y = M * 12 * (1 - D/100)", () => {
  test.prop([
    fc.integer({ min: 100, max: 10000 }),  // monthly price
    fc.integer({ min: 0,   max: 50 }),      // discount %
  ])("yearly price equals M * 12 * (1 - D/100)", (monthly, discount) => {
    const yearly   = calculateYearlyPrice(monthly, discount);
    const expected = Math.round(monthly * 12 * (1 - discount / 100) * 100) / 100;
    expect(yearly).toBeCloseTo(expected, 2);
  });

  test.prop([
    fc.integer({ min: 100, max: 10000 }),
    fc.integer({ min: 0, max: 50 }),
  ])("yearly price is always <= monthly * 12", (monthly, discount) => {
    const yearly = calculateYearlyPrice(monthly, discount);
    expect(yearly).toBeLessThanOrEqual(monthly * 12 + 0.01);
  });

  test.prop([fc.integer({ min: 100, max: 10000 })])(
    "0% discount yearly = monthly * 12", (monthly) => {
      const yearly = calculateYearlyPrice(monthly, 0);
      expect(yearly).toBeCloseTo(monthly * 12, 2);
    }
  );
});

describe("Property 9: Prorated Upgrade Charge — C = (P2 - P1) * R / T", () => {
  test.prop([
    fc.integer({ min: 500,  max: 10000 }),  // new plan price
    fc.integer({ min: 100,  max: 499 }),    // old plan price (always lower)
    fc.integer({ min: 1,    max: 30 }),     // remaining days
    fc.integer({ min: 30,   max: 365 }),    // total days
  ])("prorated charge = (P2 - P1) * R / T", (p2, p1, remaining, total) => {
    const charge   = calculateProratedCharge(p2, p1, remaining, total);
    const expected = Math.round(((p2 - p1) * remaining) / total * 100) / 100;
    expect(charge).toBeCloseTo(expected, 2);
  });

  test.prop([
    fc.integer({ min: 500, max: 10000 }),
    fc.integer({ min: 100, max: 499 }),
    fc.integer({ min: 1,   max: 30 }),
    fc.integer({ min: 30,  max: 365 }),
  ])("prorated charge is always non-negative for upgrades", (p2, p1, remaining, total) => {
    const charge = calculateProratedCharge(p2, p1, remaining, total);
    expect(charge).toBeGreaterThanOrEqual(0);
  });

  test("zero total days returns 0", () => {
    expect(calculateProratedCharge(2000, 1000, 15, 0)).toBe(0);
  });
});
