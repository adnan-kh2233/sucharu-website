const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/server");

let server;
let baseUrl;
const futureDhakaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));
test.before(async () => {
  server = createApp().listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("health endpoint reports unavailable database instead of claiming readiness", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "database_unavailable", database: "disconnected" });
});

test("booking endpoint rejects invalid Bangladesh phone before database access", async () => {
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer: { name: "Test", phone: "12345" } }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Bangladesh mobile number/);
});

test("booking endpoint rejects unconfigured service areas before database access", async () => {
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer: { name: "Test Customer", phone: "01303434078" },
      service: { name: "Home Cleaning" }, schedule: { date: futureDhakaDate, time: "09:00 AM - 11:00 AM" },
      area: "Dhaka", address: "House 1", paymentMethod: "cash_on_service",
    }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /service area/);
});

test("unknown API paths return JSON 404", async () => {
  const response = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(response.status, 404);
  assert.equal(typeof (await response.json()).message, "string");
});
