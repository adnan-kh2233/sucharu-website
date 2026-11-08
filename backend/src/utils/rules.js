const SERVICE_AREAS = new Set(["Sonadanga", "Khulna Sadar", "Khalishpur", "Daulatpur", "other-kcc"]);
const PAYMENT_METHODS = new Set(["cash_on_service", "bkash_manual", "nagad_manual"]);
const TIME_WINDOWS = new Set(["09:00 AM - 11:00 AM", "11:00 AM - 01:00 PM", "02:00 PM - 04:00 PM", "04:00 PM - 06:00 PM", "06:00 PM - 08:00 PM"]);

function normalizeBangladeshMobile(value) {
  const normalized = String(value || "").replace(/[\s-]/g, "");
  return /^(?:\+?8801|01)[3-9]\d{8}$/.test(normalized) ? normalized : null;
}

function bookingPriceSnapshot(service) {
  if (service.pricingModel === "quote") return { pricingModel: "quote", estimatedPrice: null };
  const amount = Number(service.startingPrice);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError("Service has an invalid starting estimate.");
  return { pricingModel: "fixed", estimatedPrice: amount };
}

function isValidFutureLocalDate(value, today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date())) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isCalendarDate = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  return isCalendarDate && value >= today;
}

module.exports = { SERVICE_AREAS, PAYMENT_METHODS, TIME_WINDOWS, normalizeBangladeshMobile, bookingPriceSnapshot, isValidFutureLocalDate };
