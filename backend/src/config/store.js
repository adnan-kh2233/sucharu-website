const { getFirestoreDb } = require("./firebase");

const db = () => getFirestoreDb();
const collection = name => db().collection(name);
function normalize(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}
function fromDoc(snapshot) { return snapshot.exists ? { ...normalize(snapshot.data()), _id: snapshot.id } : null; }
async function get(name, id) { return fromDoc(await collection(name).doc(String(id)).get()); }
async function all(name) { const snapshot = await collection(name).get(); return snapshot.docs.map(fromDoc); }
async function put(name, id, data, merge = false) {
  const ref = collection(name).doc(String(id));
  const existing = await ref.get();
  const now = new Date();
  const value = { ...data, updatedAt: now, ...(existing.exists ? {} : { createdAt: now }) };
  await ref.set(value, { merge });
  return fromDoc(await ref.get());
}
async function remove(name, id) { await collection(name).doc(String(id)).delete(); }
const emailId = email => Buffer.from(String(email).trim().toLowerCase()).toString("base64url");
module.exports = { all, collection, db, emailId, fromDoc, get, normalize, put, remove };
