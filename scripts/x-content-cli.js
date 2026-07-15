#!/usr/bin/env node
const service = require("../lib/x-content/service");
const xClient = require("../lib/x-content/x-client");

async function main() {
  const command = process.argv[2] || "health";
  let result;
  if (command === "health") result = await service.heartbeat();
  else if (command === "discover") result = await service.discover();
  else if (command === "publish") result = await service.publishNext({ dryRun: process.argv.includes("--dry-run") });
  else if (command === "verify-x") result = await xClient.verifyIdentity();
  else throw new Error("Usage: x-content-cli.js [health|discover|publish --dry-run|verify-x]");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
main().catch((error) => { process.stderr.write(`${error.code || "ERROR"}: ${error.message}\n`); process.exitCode = 1; });
