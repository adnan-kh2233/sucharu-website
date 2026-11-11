const { getRealtimeDatabase } = require("../config/firebase");

async function publishLivePartnerLocation(booking, location) {
  try {
    const database = getRealtimeDatabase();
    if (!database) return;
    await database.ref("livePartnerLocations").child(String(booking.bookingId)).set({
      bookingId: String(booking.bookingId),
      customerUid: String(booking.customerId),
      partnerId: String(booking.partner?.partnerId || ""),
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracy: Number(location.accuracy),
      updatedAt: new Date(location.updatedAt || Date.now()).getTime(),
    });
  } catch (error) {
    console.warn("[live-location] Realtime Database publish failed:", error.code || error.name || "unknown");
  }
}

async function clearLivePartnerLocation(bookingId) {
  try {
    const database = getRealtimeDatabase();
    if (!database) return;
    await database.ref("livePartnerLocations").child(String(bookingId)).remove();
  } catch (error) {
    console.warn("[live-location] Realtime Database cleanup failed:", error.code || error.name || "unknown");
  }
}

module.exports = { clearLivePartnerLocation, publishLivePartnerLocation };
