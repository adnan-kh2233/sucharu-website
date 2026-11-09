const crypto = require("node:crypto");
const { collection } = require("../config/store");
const { getFirebaseMessaging } = require("../config/firebase");

function tokenId(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function notifyCustomer({ customerId, bookingId, type, title, body }) {
  if (!customerId) return;
  try {
    const ref = collection("customerNotifications").doc();
    await ref.set({ customerId: String(customerId), bookingId: String(bookingId || ""), type, title, body, readAt: null, createdAt: new Date() });
    const snapshot = await collection("customerDeviceTokens").where("customerId", "==", String(customerId)).get();
    if (snapshot.empty) return;
    const tokens = snapshot.docs.map(doc => ({ id: doc.id, token: doc.data().token })).filter(row => row.token);
    if (!tokens.length) return;
    const result = await getFirebaseMessaging().sendEachForMulticast({
      tokens: tokens.map(row => row.token),
      notification: { title, body },
      data: { type: String(type), bookingId: String(bookingId || "") },
      android: { priority: "high", notification: { channelId: "sucharu_booking_updates" } },
      webpush: { notification: { icon: "/assets/logo.png", tag: String(bookingId || type) } },
    });
    const removals = [];
    result.responses.forEach((response, index) => {
      const code = response.error?.code || "";
      if (!response.success && (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token"))) {
        removals.push(collection("customerDeviceTokens").doc(tokens[index].id).delete());
      }
    });
    if (removals.length) await Promise.allSettled(removals);
  } catch (error) {
    console.warn("[customer-notification] Push delivery failed:", error.code || error.name || "unknown");
  }
}

module.exports = { notifyCustomer, tokenId };
