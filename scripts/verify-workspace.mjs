#!/usr/bin/env node
import { existsSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "docs/DOCS_INDEX.md",
  "docs/AI_AGENT_RULES.md",
  "docs/SECURITY.md",
  "apps/desktop/package.json",
  "workers/ocr/pyproject.toml",
  ".gitignore",
  "pnpm-workspace.yaml",
];

const optionalFiles = [
  "apps/desktop/src/app/App.tsx",
  "workers/ocr/guestfill_ocr/__main__.py",
  ".github/workflows/quality.yml",
];

let allOk = true;

console.log("Verifying workspace structure...\n");

for (const file of requiredFiles) {
  if (existsSync(file)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} -- MISSING`);
    allOk = false;
  }
}

console.log("\nOptional files:");

for (const file of optionalFiles) {
  if (existsSync(file)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  - ${file} (optional, not found)`);
  }
}

if (allOk) {
  console.log("\nWorkspace structure looks good.");
  process.exit(0);
} else {
  console.log("\nSome required files are missing. Check the list above.");
  process.exit(1);
}
