#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function commandExists(command) {
  const result = spawnSync(
    process.platform === "win32" ? "where" : "which",
    [command],
    { stdio: "ignore" },
  );
  return result.status === 0;
}

if (!commandExists("codegraph")) {
  console.log("CodeGraph CLI not found. Skipping CodeGraph update.");
  console.log("To enable CodeGraph, install it from: https://codegraph.dev");
  process.exit(0);
}

const candidates = [
  ["codegraph", ["index"]],
  ["codegraph", ["update"]],
];

for (const [cmd, args] of candidates) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });

  if (result.status === 0) {
    console.log("CodeGraph update complete.");
    process.exit(0);
  }
}

console.log("CodeGraph CLI found, but no known update command succeeded.");
console.log("Please update scripts/codegraph-trigger.mjs with the correct command.");
process.exit(0);
