/**
 * Copy gradeflow-shared into functions/packages so Firebase deploy (functions/ only) resolves file: deps.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const src = path.join(root, "packages/gradeflow-shared");
const dest = path.join(root, "functions/packages/gradeflow-shared");

if (!fs.existsSync(src)) {
  console.error("Missing packages/gradeflow-shared");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });

execSync("npm install", { cwd: path.join(root, "functions"), stdio: "inherit" });
