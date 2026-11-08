const express = require("express");
const bcrypt = require("bcryptjs");
const { all, put } = require("../config/store");
const { requireCustomer } = require("../middleware/auth");
const { SERVICE_AREAS, normalizeBangladeshMobile } = require("../utils/rules");

const router = express.Router();
router.use(requireCustomer);

function profile(customer) {
  return {
    name: customer.name,
    phone: customer.phone,
    email: customer.email || "",
    defaultAddress: customer.defaultAddress || null,
  };
}

router.get("/me", (req, res) => res.json({ customer: profile(req.customer) }));

router.patch("/me", async (req, res, next) => {
  try {
    const body = req.body || {}, update = {};
    let identityChanged = false;
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = String(body.name || "").trim();
      if (!name || name.length > 120) return res.status(400).json({ message: "Enter a name up to 120 characters." });
      update.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      const normalized = normalizeBangladeshMobile(body.phone);
      if (!normalized) return res.status(400).json({ message: "Enter a valid Bangladesh mobile number." });
      const phone = normalized.startsWith("01") ? normalized : normalized.replace(/^\+?880/, "0");
      if ((await all("customers")).some(customer => customer._id !== req.customer._id && customer.phone === phone)) {
        return res.status(409).json({ message: "Another account already uses that phone number." });
      }
      update.phone = phone;
      identityChanged = phone !== req.customer.phone;
    }
    if (Object.prototype.hasOwnProperty.call(body, "email")) {
      const email = String(body.email || "").trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
      if ((await all("customers")).some(customer => customer._id !== req.customer._id && String(customer.email || "").trim().toLowerCase() === email)) {
        return res.status(409).json({ message: "Another account already uses that email address." });
      }
      update.email = email;
      identityChanged = identityChanged || email !== String(req.customer.email || "").trim().toLowerCase();
    }
    const newPassword = String(body.newPassword || "");
    if (identityChanged || newPassword) {
      const currentPassword = String(body.currentPassword || "");
      if (!await bcrypt.compare(currentPassword, req.customer.passwordHash || "")) return res.status(401).json({ message: "Enter your current password to change your phone, email or password." });
    }
    if (newPassword) {
      if (newPassword.length < 6 || newPassword.length > 200) return res.status(400).json({ message: "New password must be at least 6 characters." });
      update.passwordHash = await bcrypt.hash(newPassword, 12);
      update.passwordChangedAt = new Date();
    }
    if (Object.prototype.hasOwnProperty.call(body, "defaultAddress")) {
      if (body.defaultAddress === null) {
        update.defaultAddress = null;
      } else {
        const value = body.defaultAddress || {};
        const label = String(value.label || "Home").trim(), area = String(value.area || "").trim();
        const address = String(value.address || "").trim(), landmark = String(value.landmark || "").trim();
        const latitude = value.latitude == null ? null : Number(value.latitude);
        const longitude = value.longitude == null ? null : Number(value.longitude);
        if (!label || label.length > 40 || !SERVICE_AREAS.has(area) || !address || address.length > 500 || landmark.length > 250) {
          return res.status(400).json({ message: "Check the address label, service area, full address and landmark." });
        }
        if ((latitude === null) !== (longitude === null)
          || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
          || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
          return res.status(400).json({ message: "Choose a valid map pin, or clear both coordinates." });
        }
        update.defaultAddress = { label, area, address, landmark, latitude, longitude, mapProvider: latitude === null ? null : "openstreetmap" };
      }
    }
    if (!Object.keys(update).length) return res.status(400).json({ message: "There are no profile changes to save." });
    const customer = await put("customers", req.customer._id, update, true);
    return res.json({ customer: profile(customer), message: "Profile updated." });
  } catch (error) { next(error); }
});

router.get("/bookings", async (req, res, next) => {
  try {
    return res.json((await all("bookings"))
      .filter(booking => booking.customerId === req.customer._id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 100)
      .map(({ bookingId, service, schedule, area, address, landmark, location, paymentMethod, paymentStatus, status, createdAt }) => ({
        bookingId, service: { name: service?.name }, schedule, area, address, landmark, location, paymentMethod, paymentStatus, status, createdAt,
      })));
  } catch (error) { next(error); }
});

module.exports = router;
