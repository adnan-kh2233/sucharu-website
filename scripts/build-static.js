const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const publicPaths = ["index.html", "css", "js", "assets", "admin", "partner"];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const item of publicPaths) {
  const source = path.join(root, item);
  if (!fs.existsSync(source)) throw new Error(`Required website file is missing: ${item}`);
  fs.cpSync(source, path.join(output, item), { recursive: true });
}

console.log(`Prepared static website in ${path.relative(root, output)}.`);
