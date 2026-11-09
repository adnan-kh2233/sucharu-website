const express = require("express");
const bcrypt = require("bcryptjs");
const { all, collection, get, put, remove } = require("../config/store");
const { requireCustomer } = require("../middleware/auth");
const { SERVICE_AREAS, TIME_WINDOWS, isValidFutureLocalDate, normalizeBangladeshMobile } = require("../utils/rules");
const { notifyCustomer, tokenId } = require("../services/customer-notifications");
const crypto = require("node:crypto");

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
      .map(({ bookingId, service, schedule, area, address, landmark, location, paymentMethod, paymentStatus, status, partner, createdAt, review, scheduleChangeCount, cancellationReason, completionProofPresent, serviceStartedAt, serviceCompletedAt }) => ({
        bookingId, service: { name: service?.name }, schedule, area, address, landmark, location, paymentMethod, paymentStatus, status, partner: partner ? { name: partner.name } : null, createdAt, review, scheduleChangeCount, cancellationReason, completionProofPresent: Boolean(completionProofPresent), serviceStartedAt, serviceCompletedAt,
      })));
  } catch (error) { next(error); }
});

router.post("/bookings/:bookingId/start-code", async (req, res, next) => {
  try {
    const booking = await get("bookings", req.params.bookingId);
    if (!booking || booking.customerId !== req.customer._id) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "on_the_way" || !booking.partner?.partnerId) return res.status(409).json({ message: "A service code is available after your assigned partner is on the way." });
    const now = Date.now(), lastIssued = new Date(booking.startOtpIssuedAt || 0).getTime();
    if (booking.startOtpHash && now - lastIssued < 30000) return res.status(429).json({ message: "A code was just generated. Use the code already shown or wait 30 seconds to make a new one." });
    const code = String(crypto.randomInt(100000, 1000000)), salt = crypto.randomBytes(16).toString("hex"), hash = crypto.scryptSync(code, salt, 64).toString("hex");
    const expiresAt = new Date(now + 15 * 60 * 1000);
    await put("bookings", booking._id, { startOtpHash: hash, startOtpSalt: salt, startOtpIssuedAt: new Date(now), startOtpExpiresAt: expiresAt, startOtpAttempts: 0 }, true);
    return res.json({ bookingId: booking.bookingId, code, expiresAt, message: "Share this code with your assigned partner when they arrive." });
  } catch (error) { next(error); }
});

router.get("/bookings/:bookingId/location", async (req, res, next) => {
  try {
    const booking = await get("bookings", req.params.bookingId);
    if (!booking || booking.customerId !== req.customer._id) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "on_the_way" || !booking.partner?.partnerId) return res.status(409).json({ message: "Partner location is available only while the partner is on the way." });
    const location = await get("bookingLocations", booking._id);
    if (!location || location.partnerId !== booking.partner.partnerId || location.customerId !== req.customer._id) return res.status(404).json({ message: "Waiting for the partner to share their location." });
    if (Date.now() - new Date(location.updatedAt || 0).getTime() > 2 * 60 * 1000) return res.status(404).json({ message: "The partner location is temporarily unavailable. Waiting for the next update." });
    return res.json({ latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy, updatedAt: location.updatedAt });
  } catch (error) { next(error); }
});

router.get("/bookings/:bookingId/completion-proof", async (req, res, next) => {
  try {
    const booking = await get("bookings", req.params.bookingId);
    if (!booking || booking.customerId !== req.customer._id) return res.status(404).json({ message: "Booking not found." });
    if (!["awaiting_customer_confirmation", "customer_issue_reported", "completed"].includes(booking.status) || !booking.completionProofPresent) return res.status(404).json({ message: "No service report is available for this booking." });
    const proof = await get("bookingCompletionProofs", booking._id);
    if (!proof || proof.customerId !== req.customer._id || proof.partnerId !== booking.partner?.partnerId) return res.status(404).json({ message: "Service report not found." });
    return res.json({ bookingId: proof.bookingId, checklist: proof.checklist, notes: proof.notes, beforeImage: proof.beforeImage, afterImage: proof.afterImage, completedAt: proof.completedAt });
  } catch (error) { next(error); }
});

router.post("/bookings/:bookingId/confirmation", async (req, res, next) => {
  try {
    const booking = await get("bookings", req.params.bookingId);
    if (!booking || booking.customerId !== req.customer._id) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "awaiting_customer_confirmation" || !booking.completionProofPresent) return res.status(409).json({ message: "This booking is not waiting for customer confirmation." });
    const action = String(req.body?.action || "");
    if (action === "confirm") {
      const updated = await put("bookings", booking._id, { status: "completed", customerConfirmation: { decision: "confirmed", confirmedAt: new Date() }, serviceCompletedAt: new Date() }, true);
      const partner = booking.partner?.partnerId ? await get("partners", booking.partner.partnerId) : null;
      if (partner) await put("partners", partner._id, { completedJobs: Number(partner.completedJobs || 0) + 1 }, true);
      if (booking.partner?.partnerId) await notifyCustomer({ customerId: booking.customerId, bookingId: booking.bookingId, type: "booking_customer_confirmed", title: "Service confirmed", body: "Thank you for confirming the completed service. You can now leave a review." });
      return res.json({ bookingId: updated.bookingId, status: updated.status, message: "Service confirmed. You can now rate your partner." });
    }
    if (action !== "report_issue") return res.status(400).json({ message: "Choose confirm or report a problem." });
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 10 || reason.length > 1500) return res.status(400).json({ message: "Describe the problem in 10 to 1500 characters." });
    const ticketDocumentId = collection("supportTickets").doc().id;
    const ticketId = `ST-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    await put("supportTickets", ticketDocumentId, {
      ticketId, customerId: req.customer._id, customer: { name: req.customer.name, phone: req.customer.phone, email: req.customer.email || "" },
      bookingId: booking.bookingId, category: "service_completion", subject: `Service completion concern · ${booking.bookingId}`,
      message: reason, status: "open", lastReply: "", type: "service_completion_issue",
    });
    const updated = await put("bookings", booking._id, { status: "customer_issue_reported", customerConfirmation: { decision: "issue_reported", reportedAt: new Date(), ticketId } }, true);
    await notifyCustomer({ customerId: booking.customerId, bookingId: booking.bookingId, type: "booking_issue_received", title: "Your concern was sent to Sucharu", body: `Support request ${ticketId} is open. The booking will stay pending while the team follows up.` });
    return res.status(201).json({ bookingId: updated.bookingId, status: updated.status, ticketId, message: "Your concern was sent to Sucharu. This booking will remain pending while the team follows up." });
  } catch (error) { next(error); }
});

router.get("/favorites", async (req, res, next) => {
  try {
    const favorites = (await all("customerFavorites"))
      .filter(row => row.customerId === req.customer._id)
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
      .map(({ serviceId, createdAt }) => ({ serviceId, createdAt }));
    return res.json(favorites);
  } catch (error) { next(error); }
});

router.put("/favorites/:serviceId", async (req, res, next) => {
  try {
    const serviceId = String(req.params.serviceId || "").trim();
    const service = serviceId && serviceId.length <= 120 ? await get("services", serviceId) : null;
    if (!service || service.active !== true) return res.status(404).json({ message: "This service is not available to save right now." });
    const id = crypto.createHash("sha256").update(`${req.customer._id}:${serviceId}`).digest("hex");
    await put("customerFavorites", id, { customerId: req.customer._id, serviceId });
    return res.json({ serviceId, saved: true, message: "Service saved to your favorites." });
  } catch (error) { next(error); }
});

router.delete("/favorites/:serviceId", async (req, res, next) => {
  try {
    const serviceId = String(req.params.serviceId || "").trim();
    if (!serviceId || serviceId.length > 120) return res.status(400).json({ message: "Choose a valid service." });
    const id = crypto.createHash("sha256").update(`${req.customer._id}:${serviceId}`).digest("hex");
    const favorite = await get("customerFavorites", id);
    if (favorite && favorite.customerId === req.customer._id) await remove("customerFavorites", id);
    return res.json({ serviceId, saved: false, message: "Service removed from your favorites." });
  } catch (error) { next(error); }
});

router.post("/device-tokens", async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim(), action = String(req.body?.action || "register");
    if (token.length < 32 || token.length > 4096) return res.status(400).json({ message: "A valid notification token is required." });
    const id = tokenId(token), ref = collection("customerDeviceTokens").doc(id);
    if (action === "delete") {
      const existing = await ref.get();
      if (existing.exists && existing.data().customerId === req.customer._id) await ref.delete();
      return res.json({ message: "Notification device removed." });
    }
    const platform = String(req.body?.platform || "android");
    if (!["android", "web"].includes(platform)) return res.status(400).json({ message: "Choose a valid notification platform." });
    await ref.set({ token, customerId: req.customer._id, platform, updatedAt: new Date() }, { merge: true });
    return res.json({ message: "Notifications enabled." });
  } catch (error) { next(error); }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const rows = (await all("customerNotifications"))
      .filter(row => row.customerId === req.customer._id)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 50)
      .map(({ _id, bookingId, type, title, body, readAt, createdAt }) => ({ id: _id, bookingId, type, title, body, readAt, createdAt }));
    return res.json(rows);
  } catch (error) { next(error); }
});

router.patch("/notifications/:notificationId/read", async (req, res, next) => {
  try {
    const notification = await get("customerNotifications", req.params.notificationId);
    if (!notification || notification.customerId !== req.customer._id) return res.status(404).json({ message: "Notification not found." });
    if (!notification.readAt) await put("customerNotifications", notification._id, { readAt: new Date() }, true);
    return res.json({ message: "Notification marked as read." });
  } catch (error) { next(error); }
});

router.post("/bookings/:bookingId/cancel", async (req, res, next) => {
  try {
    const booking = await get("bookings", req.params.bookingId);
    if (!booking || booking.customerId !== req.customer._id) return res.status(404).json({ message: "Booking not found." });
    if (!["booking_received", "confirmed"].includes(booking.status) || booking.partner?.partnerId) {
      return res.status(409).json({ message: "This booking can no longer be cancelled in the app. Please contact Sucharu support." });
    }
    const reason = String(req.body?.reason || "").trim();
    if (reason.length > 300) return res.status(400).json({ message: "Cancellation note must be 300 characters or less." });
    const updated = await put("bookings", booking._id, { status: "cancelled", cancellationReason: reason, cancelledBy: "customer", cancelledAt: new Date() }, true);
    await remove("bookingLocations", booking._id);
    await notifyCustomer({ customerId: booking.customerId, bookingId: booking.bookingId, type: "booking_cancelled", title: "Booking cancelled", body: `Your ${booking.service?.name || "service"} request has been cancelled.` });
    return res.json({ bookingId: updated.bookingId, status: updated.status, message: "Booking cancelled." });
  } catch (error) { next(error); }
});

router.patch("/bookings/:bookingId/schedule", async (req, res, next) => {
  try {
    const booking = await get("bookings", req.params.bookingId);
    if (!booking || booking.customerId !== req.customer._id) return res.status(404).json({ message: "Booking not found." });
    if (!["booking_received", "confirmed"].includes(booking.status) || booking.partner?.partnerId) {
      return res.status(409).json({ message: "This booking can no longer be rescheduled in the app. Please contact Sucharu support." });
    }
    if (Number(booking.scheduleChangeCount || 0) >= 3) return res.status(409).json({ message: "This booking has reached its reschedule limit. Please contact Sucharu support." });
    const date = String(req.body?.date || ""), time = String(req.body?.time || "");
    if (!isValidFutureLocalDate(date) || !TIME_WINDOWS.has(time)) return res.status(400).json({ message: "Choose a valid future date and available time window." });
    if (date === booking.schedule?.date && time === booking.schedule?.time) return res.status(400).json({ message: "Choose a different date or time." });
    const prior = Array.isArray(booking.scheduleHistory) ? booking.scheduleHistory.slice(-4) : [];
    prior.push({ ...booking.schedule, changedAt: new Date() });
    const updated = await put("bookings", booking._id, { schedule: { date, time }, scheduleHistory: prior, scheduleChangeCount: Number(booking.scheduleChangeCount || 0) + 1 }, true);
    await notifyCustomer({ customerId: booking.customerId, bookingId: booking.bookingId, type: "schedule_changed", title: "Booking rescheduled", body: `Your ${booking.service?.name || "service"} is now scheduled for ${date} · ${time}.` });
    return res.json({ bookingId: updated.bookingId, schedule: updated.schedule, message: "Booking rescheduled." });
  } catch (error) { next(error); }
});

router.post("/bookings/:bookingId/review", async (req, res, next) => {
  try {
    const booking = await get("bookings", req.params.bookingId);
    if (!booking || booking.customerId !== req.customer._id) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "completed") return res.status(409).json({ message: "You can review a service after it is completed." });
    if (booking.review) return res.status(409).json({ message: "A review has already been submitted for this booking." });
    const rating = Number(req.body?.rating), comment = String(req.body?.comment || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 1000) return res.status(400).json({ message: "Choose a rating from 1 to 5 and keep the review under 1000 characters." });
    const review = { rating, comment, createdAt: new Date() };
    await put("bookings", booking._id, { review }, true);
    return res.status(201).json({ review, message: "Thank you for reviewing your service." });
  } catch (error) { next(error); }
});

router.post("/support", async (req, res, next) => {
  try {
    const category = String(req.body?.category || "general"), subject = String(req.body?.subject || "").trim(), message = String(req.body?.message || "").trim(), bookingId = String(req.body?.bookingId || "").trim();
    if (!new Set(["general", "booking", "payment", "partner", "other"]).has(category)) return res.status(400).json({ message: "Choose a valid support topic." });
    if (!subject || subject.length > 120 || message.length < 10 || message.length > 2000) return res.status(400).json({ message: "Enter a subject and a message between 10 and 2000 characters." });
    if (bookingId) {
      const booking = await get("bookings", bookingId);
      if (!booking || booking.customerId !== req.customer._id) return res.status(404).json({ message: "Related booking not found." });
    }
    const openTickets = (await all("supportTickets")).filter(ticket => ticket.customerId === req.customer._id && ticket.status !== "resolved");
    if (openTickets.length >= 5) return res.status(429).json({ message: "You have several open support requests. Please wait for the Sucharu team to reply." });
    const id = collection("supportTickets").doc().id, ticketId = `ST-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    await put("supportTickets", id, { ticketId, customerId: req.customer._id, customer: { name: req.customer.name, phone: req.customer.phone, email: req.customer.email || "" }, bookingId, category, subject, message, status: "open", lastReply: "" });
    return res.status(201).json({ ticketId, message: "Your support request has been received. The Sucharu team will follow up." });
  } catch (error) { next(error); }
});

router.get("/support", async (req, res, next) => {
  try {
    const tickets = (await all("supportTickets"))
      .filter(ticket => ticket.customerId === req.customer._id)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 30)
      .map(({ ticketId, bookingId, category, subject, status, lastReply, createdAt, repliedAt }) => ({ ticketId, bookingId, category, subject, status, lastReply, createdAt, repliedAt }));
    return res.json(tickets);
  } catch (error) { next(error); }
});

module.exports = router;
