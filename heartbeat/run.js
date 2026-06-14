#!/usr/bin/env node

const { generateHeartbeat, sendHeartbeat } = require("./summary");

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldSend = args.has("--send");
  const json = args.has("--json");

  const result = shouldSend
    ? await sendHeartbeat()
    : { summary: await generateHeartbeat(), telegram: { sent: false, status: "Dry run" } };

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${result.summary.telegramMessage}\n`);
  if (shouldSend) {
    process.stdout.write(`\nTelegram: ${result.telegram.status}${result.telegram.reason ? ` (${result.telegram.reason})` : ""}\n`);
  } else {
    process.stdout.write("\nTelegram: Dry run. Add --send to send.\n");
  }
}

main().catch((error) => {
  process.stderr.write(`Heartbeat failed: ${error.message}\n`);
  process.exitCode = 1;
});
