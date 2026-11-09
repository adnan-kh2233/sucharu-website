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
    if (ticket.type === "service_completion_issue" && status === "resolved" && reply.length < 3) return res.status(400).json({ message: "Write a resolution note before resolving a service concern." });
    const update = { status };
    if (reply) { update.lastReply = reply; update.repliedAt = new Date(); }
    const updated = await put("supportTickets", ticket._id, update, true);
    if (ticket.type === "service_completion_issue" && status === "resolved" && ticket.bookingId) {
      const booking = (await all("bookings")).find(row => row.bookingId === ticket.bookingId && row.customerId === ticket.customerId);
      if (booking && booking.status === "customer_issue_reported") {
        await put("bookings", booking._id, { status: "completed", customerConfirmation: { ...(booking.customerConfirmation || {}), decision: "admin_resolved", resolvedAt: new Date(), ticketId: ticket.ticketId }, serviceCompletedAt: new Date() }, true);
        const partner = booking.partner?.partnerId ? await get("partners", booking.partner.partnerId) : null;
        if (partner) await put("partners", partner._id, { completedJobs: Number(partner.completedJobs || 0) + 1 }, true);
        await notifyCustomer({ customerId: booking.customerId, bookingId: booking.bookingId, type: "booking_issue_resolved", title: "Service concern resolved", body: reply.slice(0, 180) });
      }
    }
    if (reply && !(ticket.type === "service_completion_issue" && status === "resolved")) await notifyCustomer({ customerId: ticket.customerId, bookingId: ticket.bookingId, type: "support_reply", title: "Sucharu replied to your request", body: reply.slice(0, 180) });
    return res.json({ ticketId: updated.ticketId, status: updated.status, message: "Support request updated." });
  } catch (error) { next(error); }
});

module.exports = router;
