import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const configPath = path.resolve("config/production-routes.json");
const config = JSON.parse(await fs.readFile(configPath, "utf8"));

let failed = 0;

for (const route of config.routes) {
  const response = await fetch(route.url, {
    redirect: "follow",
    headers: {
      "user-agent": "doneovernight-route-safety/1.0"
    }
  });
  const body = await response.text();
  const failures = [];

  if (response.status !== route.expectedStatus) {
    failures.push(`expected ${route.expectedStatus}, got ${response.status}`);
  }

  for (const marker of route.mustContain || []) {
    if (!body.includes(marker)) {
      failures.push(`missing marker: ${marker}`);
    }
  }

  for (const marker of route.mustNotContain || []) {
    if (body.includes(marker)) {
      failures.push(`forbidden marker present: ${marker}`);
    }
  }

  if (failures.length) {
    failed += 1;
    console.error(`FAIL ${route.url}`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
  } else {
    console.log(`PASS ${route.url}`);
  }
}

if (failed) {
  console.error(`Route safety failed: ${failed} route(s) failed.`);
  process.exit(1);
}

console.log(`Route safety passed: ${config.routes.length} route(s) checked.`);
