const { collection } = require("../config/store");
const { getFirebaseMessaging } = require("../config/firebase");

async function notifyPartner({ partnerId, bookingId, title, body }) {
  if (!partnerId) return;
  try {
    const snapshot = await collection("partnerDeviceTokens")
      .where("partnerId", "==", String(partnerId)).limit(500).get();
    if (snapshot.empty) return;
    const tokens = snapshot.docs.map(doc => ({ id: doc.id, token: doc.data().token })).filter(row => row.token);
    if (!tokens.length) return;
    const result = await getFirebaseMessaging().sendEachForMulticast({
      tokens: tokens.map(row => row.token),
      data: {
        type: "partner_job_assigned",
        role: "partner",
        bookingId: String(bookingId || ""),
        title: String(title || "New Sucharu job"),
        body: String(body || "A service booking has been assigned to you."),
      },
      android: { priority: "high" },
    });
    const removals = [];
    result.responses.forEach((response, index) => {
      const code = response.error?.code || "";
      if (!response.success && (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token"))) {
        removals.push(collection("partnerDeviceTokens").doc(tokens[index].id).delete());
      }
    });
    if (removals.length) await Promise.allSettled(removals);
  } catch (error) {
    console.warn("[partner-notification] Push delivery failed:", error.code || error.name || "unknown");
  }
}

module.exports = { notifyPartner };
