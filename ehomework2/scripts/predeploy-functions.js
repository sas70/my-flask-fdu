/**
 * Copy gradeflow-shared into functions/packages so Firebase deploy (functions/ only) resolves file: deps.
 *
 * ⚠️  functions/packages/gradeflow-shared is a BUILD ARTIFACT.
 *     - Do NOT edit files under functions/packages/ — they are overwritten every deploy.
 *     - Edit the source of truth at /packages/gradeflow-shared/ instead.
 *     - The directory is gitignored; only exists on disk between predeploy and deploy.
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

// Stamp a README so anyone poking around knows these files are generated.
fs.writeFileSync(
  path.join(dest, "GENERATED.md"),
  `# Auto-generated — do not edit

This directory is copied from \`/packages/gradeflow-shared\` by
\`scripts/predeploy-functions.js\` before every Firebase deploy.

Edit the source of truth at \`/packages/gradeflow-shared/\` instead.
`
);

execSync("npm install", { cwd: path.join(root, "functions"), stdio: "inherit" });
