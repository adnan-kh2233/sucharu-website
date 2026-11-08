const jwt = require("jsonwebtoken");
const { get } = require("../config/store");
const { getFirebaseAuth } = require("../config/firebase");

function unauthorized(error, res, next) {
  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") return res.status(401).json({ message: "Session expired. Please sign in again." });
  return next(error);
}
async function bearer(req) {
  const [scheme, token] = String(req.get("authorization") || "").split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}
async function requireAdmin(req, res, next) {
  try {
    const token = await bearer(req); if (!token) return res.status(401).json({ message: "Admin sign-in required." });
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.role !== "admin" || !payload.sub) return res.status(403).json({ message: "Admin access required." });
    const admin = await get("admins", payload.sub);
    if (!admin || !admin.active) return res.status(401).json({ message: "Admin account is unavailable." });
    req.admin = admin; return next();
  } catch (error) { return unauthorized(error, res, next); }
}
async function requirePartner(req, res, next) {
  try {
    const token = await bearer(req); if (!token) return res.status(401).json({ message: "Partner sign-in required." });
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.role !== "partner" || !payload.sub) return res.status(403).json({ message: "Partner access required." });
    const partner = await get("partners", payload.sub);
    if (!partner || partner.status !== "active" || partner.verificationStatus !== "verified" || !partner.portalEnabled) return res.status(401).json({ message: "Partner account is unavailable. Contact Sucharu admin." });
    req.partner = partner; return next();
  } catch (error) { return unauthorized(error, res, next); }
}
async function requireCustomer(req, res, next) {
  try {
    const token = await bearer(req); if (!token) return res.status(401).json({ message: "Please sign in to continue." });
    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] }); }
    catch (jwtError) {
      try { payload = await getFirebaseAuth().verifyIdToken(token); }
      catch { return res.status(401).json({ message: "Session expired. Please sign in again." }); }
    }
    const uid = payload.sub || payload.uid;
    if (payload.role !== "customer" || !uid) return res.status(403).json({ message: "Customer account required." });
    const customer = await get("customers", uid);
    if (!customer || !customer.active) return res.status(401).json({ message: "Customer account is unavailable. Please sign in again." });
    req.customer = customer; return next();
  } catch (error) { return unauthorized(error, res, next); }
}
module.exports = { requireAdmin, requirePartner, requireCustomer };
