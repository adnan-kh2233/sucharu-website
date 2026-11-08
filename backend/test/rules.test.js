const test = require("node:test");
const assert = require("node:assert/strict");
const { PAYMENT_METHODS, SERVICE_AREAS, TIME_WINDOWS, normalizeBangladeshMobile, bookingPriceSnapshot, isValidFutureLocalDate } = require("../src/utils/rules");

test("Bangladesh mobile numbers are normalized and validated", () => {
  assert.equal(normalizeBangladeshMobile("01303-434078"), "01303434078");
  assert.equal(normalizeBangladeshMobile("+8801303434078"), "+8801303434078");
  assert.equal(normalizeBangladeshMobile("12345"), null);
});

test("service area and payment choices match the configured launch flow", () => {
  assert.equal(SERVICE_AREAS.has("Sonadanga"), true);
  assert.equal(SERVICE_AREAS.has("other-kcc"), true);
  assert.equal(SERVICE_AREAS.has("Dhaka"), false);
  assert.deepEqual([...PAYMENT_METHODS].sort(), ["bkash_manual", "cash_on_service", "nagad_manual"]);
  assert.equal(TIME_WINDOWS.has("09:00 AM - 11:00 AM"), true);
  assert.equal(TIME_WINDOWS.has("03:00 AM - 04:00 AM"), false);
});

test("booking estimate is copied from trusted service data; quotations remain unpriced", () => {
  assert.deepEqual(bookingPriceSnapshot({ pricingModel: "fixed", startingPrice: 1500 }), { pricingModel: "fixed", estimatedPrice: 1500 });
  assert.deepEqual(bookingPriceSnapshot({ pricingModel: "quote", startingPrice: null }), { pricingModel: "quote", estimatedPrice: null });
  assert.throws(() => bookingPriceSnapshot({ pricingModel: "fixed", startingPrice: -1 }), /invalid starting estimate/);
  assert.throws(() => bookingPriceSnapshot({ pricingModel: "fixed", startingPrice: "untrusted" }), /invalid starting estimate/);
});

test("booking dates use YYYY-MM-DD and Dhaka-local minimum date", () => {
  assert.equal(isValidFutureLocalDate("2026-10-16", "2026-10-16"), true);
  assert.equal(isValidFutureLocalDate("2026-10-15", "2026-10-16"), false);
  assert.equal(isValidFutureLocalDate("2026-02-30", "2026-01-01"), false);
  assert.equal(isValidFutureLocalDate("today", "2026-10-16"), false);
});
