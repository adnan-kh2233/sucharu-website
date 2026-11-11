const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { all, collection, db, emailId, get, put } = require("../config/store");
const { normalizeBangladeshMobile } = require("../utils/rules");
const { createCustomerCustomToken, getFirebaseAuth } = require("../config/firebase");
const { isEmailDeliveryConfigured, sendCustomerPasswordResetCode } = require("../services/email");
const { requireCustomer } = require("../middleware/auth");

const router = express.Router();
const WINDOW_MS = 15 * 60 * 1000, MAX_ATTEMPTS = 8;
const RESET_CODE_TTL_MS = 10 * 60 * 1000, RESET_CODE_MAX_ATTEMPTS = 5;
const EMAIL_RESET_MIN_INTERVAL_MS = 60 * 1000, EMAIL_RESET_MAX_PER_HOUR = 5;
const attempts = new Map();
const emailResetRequests = new Map();
function canonicalPhone(value) { const normalized = normalizeBangladeshMobile(value); return normalized ? (normalized.startsWith("01") ? normalized : normalized.replace(/^\+?880/, "0")) : null; }
function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function validEmail(value) { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function resetChallengeId(email) { return crypto.createHmac("sha256", process.env.JWT_SECRET).update(email).digest("hex"); }
function resetCodeHash(email, code) { return crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${email}:${code}`).digest("hex"); }
function allowEmailResetRequest(email, now = Date.now()) {
  const key = resetChallengeId(email), prior = (emailResetRequests.get(key) || []).filter(time => now - time < 60 * 60 * 1000);
  if (prior.length >= EMAIL_RESET_MAX_PER_HOUR || (prior.length && now - prior[prior.length - 1] < EMAIL_RESET_MIN_INTERVAL_MS)) {
    emailResetRequests.set(key, prior);
    return false;
  }
  prior.push(now);
  emailResetRequests.set(key, prior);
  return true;
}
function limited(ip) { const r = attempts.get(ip); return r && Date.now() - r.startedAt < WINDOW_MS && r.count >= MAX_ATTEMPTS; }
function fail(ip) { const r = attempts.get(ip), fresh = !r || Date.now() - r.startedAt >= WINDOW_MS; attempts.set(ip, { startedAt: fresh ? Date.now() : r.startedAt, count: fresh ? 1 : r.count + 1 }); }
function sign(role, id, duration) { return jwt.sign({ role }, process.env.JWT_SECRET, { subject: id, expiresIn: duration, algorithm: "HS256" }); }
async function customerSession(customer) {
  const profile = { name: customer.name, phone: customer.phone, email: customer.email || "" };
  if (String(process.env.CUSTOMER_AUTH_MODE || "legacy").toLowerCase() === "firebase") return { firebaseCustomToken: await createCustomerCustomToken(customer), customer: profile };
  return { token: sign("customer", customer._id, "7d"), customer: profile };
}

router.post("/login", async (req, res, next) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ message: "Too many sign-in attempts. Try again in 15 minutes." });
    const email = String(req.body?.email || "").trim().toLowerCase(), password = String(req.body?.password || "");
    if (email.length > 254 || password.length > 200) return res.status(400).json({ message: "Invalid sign-in details." });
    const id = emailId(email), admin = await get("admins", id);
    if (!admin?.active || !await bcrypt.compare(password, admin.passwordHash || "")) { fail(req.ip); return res.status(401).json({ message: "Email or password is incorrect." }); }
    attempts.delete(req.ip); await put("admins", id, { lastLoginAt: new Date() }, true);
    return res.json({ token: sign("admin", id, "8h"), admin: { name: admin.name, email: admin.email, role: admin.role } });
  } catch (error) { next(error); }
});

router.post("/partner/login", async (req, res, next) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ message: "Too many sign-in attempts. Try again in 15 minutes." });
    const phone = String(req.body?.phone || "").replace(/[\s-]/g, ""), password = String(req.body?.password || "");
    const partner = (await all("partners")).find(p => p.phone === phone && p.status === "active" && p.verificationStatus === "verified" && p.portalEnabled);
    if (phone.length > 20 || password.length > 200 || !partner || !await bcrypt.compare(password, partner.passwordHash || "")) { fail(req.ip); return res.status(401).json({ message: "Phone or password is incorrect, or portal access is not enabled." }); }
    attempts.delete(req.ip); await put("partners", partner._id, { lastPortalLoginAt: new Date() }, true);
    return res.json({ token: sign("partner", partner._id, "8h"), partner: { name: partner.name, partnerId: partner.partnerId } });
  } catch (error) { next(error); }
});

router.post("/customer/register", async (req, res, next) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    const name = String(req.body?.name || "").trim(), phone = canonicalPhone(req.body?.phone), email = normalizeEmail(req.body?.email), password = String(req.body?.password || "");
    if (!name || name.length > 120 || !phone) return res.status(400).json({ message: "Enter your name and a valid Bangladesh phone number." });
    if (!validEmail(email)) return res.status(400).json({ message: "Enter a valid email address. Email is required for account recovery." });
    if (password.length < 6 || password.length > 200) return res.status(400).json({ message: "Password must be at least 6 characters." });
    if ((await all("customers")).some(c => c.phone === phone || normalizeEmail(c.email) === email)) return res.status(409).json({ message: "An account already uses that phone or email. Please sign in instead." });
    const ref = collection("customers").doc(), id = ref.id;
    const customer = await put("customers", id, { name, phone, email, passwordHash: await bcrypt.hash(password, 12), active: true, lastLoginAt: new Date() });
    attempts.delete(req.ip); return res.status(201).json(await customerSession(customer));
  } catch (error) { next(error); }
});

router.post("/customer/login", async (req, res, next) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    const identifier = String(req.body?.identifier || "").trim(), password = String(req.body?.password || "");
    if (identifier.length > 254 || password.length > 200) return res.status(400).json({ message: "Enter your phone or email and password." });
    const email = identifier.includes("@") ? identifier.toLowerCase() : "", phone = email ? "" : canonicalPhone(identifier);
    if (!email && !phone) return res.status(400).json({ message: "Enter a valid Bangladesh phone number or registered email." });
    const customer = (await all("customers")).find(c => c.active && (email ? normalizeEmail(c.email) === email : c.phone === phone));
    if (!customer || !await bcrypt.compare(password, customer.passwordHash || "")) { fail(req.ip); return res.status(401).json({ message: "Phone/email or password is incorrect." }); }
    attempts.delete(req.ip); await put("customers", customer._id, { lastLoginAt: new Date() }, true); return res.json(await customerSession(customer));
  } catch (error) { next(error); }
});

// Exchange an authenticated Android customer API session for a Firebase Auth identity.
// The shared website can continue using its current legacy customer token mode.
router.post("/customer/firebase-session", requireCustomer, async (req, res, next) => {
  try {
    return res.json({ firebaseCustomToken: await createCustomerCustomToken(req.customer) });
  } catch (error) { next(error); }
});

router.post("/customer/password/reset/request", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ message: "Enter a valid registered email address." });
    if (!isEmailDeliveryConfigured()) return res.status(503).json({ message: "Password recovery email is not configured on the backend yet." });
    if (limited(req.ip)) return res.status(429).json({ message: "Too many reset requests. Try again later." });
    if (!allowEmailResetRequest(email)) return res.status(429).json({ message: "Wait 60 seconds before requesting another reset code." });
    fail(req.ip);

    const customer = (await all("customers")).find(c => c.active && normalizeEmail(c.email) === email);
    if (!customer) return res.json({ message: "If an account uses that email, a reset code has been sent." });

    const code = String(crypto.randomInt(100000, 1000000));
    const challengeId = resetChallengeId(email);
    const challengeRef = collection("customerPasswordResetCodes").doc(challengeId);
    await challengeRef.set({
      customerId: String(customer._id),
      email,
      codeHash: resetCodeHash(email, code),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
      attempts: 0,
      usedAt: null,
    });
    try { await sendCustomerPasswordResetCode(email, code); }
    catch (error) {
      await challengeRef.delete();
      console.error("[password-reset] Email delivery failed:", error.code || error.name || "unknown");
      return res.status(503).json({ message: "Could not send the reset email right now. Try again later." });
    }
    attempts.delete(req.ip);
    return res.json({ message: "If an account uses that email, a reset code has been sent." });
  } catch (error) { next(error); }
});

router.post("/customer/password/reset/complete", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email), code = String(req.body?.code || "").trim(), password = String(req.body?.password || "");
    if (!validEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the email address and 6-digit reset code." });
    if (password.length < 6 || password.length > 200) return res.status(400).json({ message: "Password must be at least 6 characters." });
    if (limited(req.ip)) return res.status(429).json({ message: "Too many reset attempts. Try again later." });

    const challengeId = resetChallengeId(email), challengeRef = collection("customerPasswordResetCodes").doc(challengeId);
    const newPasswordHash = await bcrypt.hash(password, 12);
    const result = await db().runTransaction(async transaction => {
      const challengeSnapshot = await transaction.get(challengeRef);
      if (!challengeSnapshot.exists) return { error: "invalid" };
      const challenge = challengeSnapshot.data();
      const now = Date.now();
      if (challenge.usedAt || !challenge.expiresAt || challenge.expiresAt.toMillis() <= now) return { error: "expired" };
      if (challenge.attempts >= RESET_CODE_MAX_ATTEMPTS) return { error: "attempts" };
      const expectedHash = resetCodeHash(email, code);
      const storedHash = String(challenge.codeHash || "");
      const valid = storedHash.length === expectedHash.length && crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(expectedHash));
      if (!valid) {
        transaction.update(challengeRef, { attempts: challenge.attempts + 1, updatedAt: new Date(now) });
        return { error: challenge.attempts + 1 >= RESET_CODE_MAX_ATTEMPTS ? "attempts" : "invalid" };
      }
      const customerRef = collection("customers").doc(String(challenge.customerId));
      const customerSnapshot = await transaction.get(customerRef);
      if (!customerSnapshot.exists || !customerSnapshot.data().active || normalizeEmail(customerSnapshot.data().email) !== email) return { error: "invalid" };
      transaction.update(customerRef, {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(now),
        emailVerifiedAt: customerSnapshot.data().emailVerifiedAt || new Date(now),
        updatedAt: new Date(now),
      });
      transaction.update(challengeRef, { usedAt: new Date(now), updatedAt: new Date(now) });
      return { customerId: String(challenge.customerId) };
    });

    if (result.error) {
      fail(req.ip);
      return res.status(result.error === "attempts" ? 429 : 400).json({ message: result.error === "attempts" ? "Too many incorrect codes. Request a new reset code." : "The reset code is invalid or expired. Request a new code." });
    }
    attempts.delete(req.ip);
    try { await getFirebaseAuth().revokeRefreshTokens(result.customerId); }
    catch (error) { if (error.code !== "auth/user-not-found") console.warn("[password-reset] Could not revoke Firebase refresh tokens:", error.code || error.name || "unknown"); }
    return res.json({ message: "Password updated. Sign in with your new password." });
  } catch (error) { next(error); }
});
module.exports = router;
