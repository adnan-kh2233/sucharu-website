const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getDatabaseWithUrl } = require("firebase-admin/database");
const fs = require("node:fs");

const APP_NAME = "sucharu-firebase-admin";

function getFirebaseApp() {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) throw new Error("Set FIREBASE_PROJECT_ID in backend/.env.");
  const existing = getApps().find(app => app.name === APP_NAME);
  if (existing) return existing;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.google_application_credentials;
  let credential = applicationDefault();
  if (credentialsPath) {
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    if (serviceAccount.type === "service_account"
      && serviceAccount.project_id === projectId
      && serviceAccount.client_email
      && serviceAccount.private_key) {
      // Local service-account keys can sign Firebase custom tokens locally and do not need
      // the remote IAM Credentials API. Keep this key outside the repository.
      credential = cert(serviceAccount);
    }
  }
  return initializeApp({ credential, projectId }, APP_NAME);
}

function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

function getFirestoreDb() {
  return getFirestore(getFirebaseApp());
}

function getFirebaseMessaging() {
  return getMessaging(getFirebaseApp());
}

function getRealtimeDatabase() {
  const databaseUrl = String(process.env.FIREBASE_DATABASE_URL || "").trim();
  if (!databaseUrl) return null;
  return getDatabaseWithUrl(databaseUrl, getFirebaseApp());
}

async function createCustomerCustomToken(customer) {
  if (!customer?._id) throw new Error("A saved customer is required to create a Firebase session.");
  return getFirebaseAuth().createCustomToken(String(customer._id), { role: "customer" });
}

async function createPartnerCustomToken(partner) {
  if (!partner?._id) throw new Error("A saved partner is required to create a Firebase session.");
  return getFirebaseAuth().createCustomToken(String(partner._id), { role: "partner" });
}

module.exports = { createCustomerCustomToken, createPartnerCustomToken, getFirebaseAuth, getFirebaseMessaging, getFirestoreDb, getRealtimeDatabase };
