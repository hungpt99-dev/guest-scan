#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const checks = [
  { name: "Node.js", command: "node", args: ["--version"], url: "https://nodejs.org" },
  { name: "pnpm", command: "pnpm", args: ["--version"], url: "https://pnpm.io/installation" },
  { name: "Python", command: "python", args: ["--version"], url: "https://www.python.org/downloads/" },
  { name: "Rust / Cargo", command: "cargo", args: ["--version"], url: "https://rustup.rs" },
];

let allOk = true;

for (const check of checks) {
  const result = spawnSync(check.command, check.args, { stdio: "pipe" });

  if (result.status === 0) {
    const version = result.stdout.toString().trim().split("\n")[0];
    console.log(`✓ ${check.name}: ${version}`);
  } else {
    console.log(`✗ ${check.name}: NOT FOUND`);
    console.log(`  Install from: ${check.url}`);
    allOk = false;
  }
}

if (allOk) {
  console.log("\nAll required tools are installed.");
  process.exit(0);
} else {
  console.log("\nSome tools are missing. Install them before development.");
  process.exit(1);
}
