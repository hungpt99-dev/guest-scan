#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function commandExists(command) {
  const result = spawnSync(
    process.platform === "win32" ? "where" : "which",
    [command],
    { stdio: "ignore" },
  );
  return result.status === 0;
}

if (commandExists("gitleaks")) {
  console.log("Running gitleaks secret scan...");
  const result = spawnSync("gitleaks", ["detect", "--source", ".", "--no-git", "--redact"], {
    stdio: "inherit",
  });
  process.exit(result.status);
}

console.log("gitleaks not found. Running basic .env scan...");

const envFiles = [".env", ".env.local", ".env.development", ".env.production"];
let foundIssues = false;

for (const file of envFiles) {
  if (existsSync(file)) {
    console.log(`WARNING: ${file} is present and should not be committed.`);
    foundIssues = true;
  }
}

if (!foundIssues) {
  console.log("No .env files found. Basic scan passed.");
  console.log("For better secret detection, install gitleaks: https://github.com/gitleaks/gitleaks");
}

process.exit(0);
