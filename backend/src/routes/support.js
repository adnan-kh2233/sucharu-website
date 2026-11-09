const express = require("express");
const { all, get, put } = require("../config/store");
const { requireAdmin } = require("../middleware/auth");
const { notifyCustomer } = require("../services/customer-notifications");

const router = express.Router();
router.use(requireAdmin);

router.get("/tickets", async (req, res, next) => {
  try {
    const tickets = (await all("supportTickets"))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 300);
    return res.json(tickets);
  } catch (error) { next(error); }
});

router.patch("/tickets/:id", async (req, res, next) => {
  try {
    const ticket = await get("supportTickets", req.params.id);
    if (!ticket) return res.status(404).json({ message: "Support request not found." });
    const status = String(req.body?.status || ticket.status), reply = String(req.body?.reply || "").trim();
    if (!["open", "in_progress", "resolved"].includes(status) || reply.length > 1500) return res.status(400).json({ message: "Choose a valid request status and reply." });
    if (reply && reply.length < 3) return res.status(400).json({ message: "Enter a reply of at least 3 characters." });
    const update = { status };
    if (reply) { update.lastReply = reply; update.repliedAt = new Date(); }
    const updated = await put("supportTickets", ticket._id, update, true);
    if (reply) await notifyCustomer({ customerId: ticket.customerId, bookingId: ticket.bookingId, type: "support_reply", title: "Sucharu replied to your request", body: reply.slice(0, 180) });
    return res.json({ ticketId: updated.ticketId, status: updated.status, message: "Support request updated." });
  } catch (error) { next(error); }
});

module.exports = router;
