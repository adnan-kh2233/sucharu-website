const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { gzipSync } = require("node:zlib");
const root = path.resolve(__dirname, "..");
require(path.join(root, "backend", "node_modules", "dotenv")).config({ path: path.join(root, "backend", ".env"), quiet: true });
const { GoogleAuth } = require(path.join(root, "backend", "node_modules", "google-auth-library"));

const siteId = String(process.env.FIREBASE_PROJECT_ID || "sucharu-87667").trim();
const distDir = path.join(root, "dist");
const apiBase = "https://firebasehosting.googleapis.com/v1beta1";

function collectFiles(dir, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const nextRelative = path.posix.join(relative, entry.name);
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath, nextRelative));
    else if (entry.isFile()) files.push({ fullPath, relative: `/${nextRelative}` });
  }
  return files;
}

async function main() {
  if (!fs.existsSync(path.join(distDir, "index.html"))) throw new Error("Build the static site first with node scripts/build-static.js.");
  const files = collectFiles(distDir);
  if (!files.length) throw new Error("No website files were found in dist/.");
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/firebase.hosting"] });
  const client = await auth.getClient();
  const authHeader = async () => `Bearer ${(await client.getAccessToken()).token}`;
  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { Authorization: await authHeader(), ...(options.headers || {}) } });
    const text = await response.text();
    let value;
    try { value = text ? JSON.parse(text) : {}; } catch { value = { message: text }; }
    if (!response.ok) throw new Error(`Firebase Hosting API returned HTTP ${response.status}: ${value.error?.message || value.message || "request failed"}`);
    return value;
  };

  const filePayloads = new Map();
  const hashes = {};
  for (const file of files) {
    const compressed = gzipSync(fs.readFileSync(file.fullPath), { level: 9 });
    const hash = crypto.createHash("sha256").update(compressed).digest("hex");
    hashes[file.relative] = hash;
    filePayloads.set(hash, compressed);
  }

  const version = await requestJson(`${apiBase}/sites/${siteId}/versions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: {} }),
  });
  const versionName = version.name;
  if (!versionName) throw new Error("Firebase did not return the new hosting version name.");
  const populate = await requestJson(`${apiBase}/${versionName}:populateFiles`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: hashes }),
  });
  const uploadUrl = populate.uploadUrl;
  for (const hash of populate.uploadRequiredHashes || []) {
    const body = filePayloads.get(hash);
    if (!body) throw new Error(`Firebase requested an unknown file hash: ${hash}`);
    const response = await fetch(`${uploadUrl}/${hash}`, {
      method: "POST", headers: { Authorization: await authHeader(), "Content-Type": "application/octet-stream" }, body,
    });
    if (!response.ok) throw new Error(`Website file upload failed with HTTP ${response.status}.`);
  }

  await requestJson(`${apiBase}/${versionName}?update_mask=status`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "FINALIZED" }),
  });
  const release = await requestJson(`${apiBase}/sites/${siteId}/releases?versionName=${encodeURIComponent(versionName)}`, { method: "POST" });
  console.log(`Published ${files.length} static website files to https://${siteId}.web.app/`);
  console.log(`Release: ${release.name || "created"}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
