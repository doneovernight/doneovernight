#!/usr/bin/env node

import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const configPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "config", "production-routes.json");

const VERCEL_EDGE_FALLBACK_IP = process.env.ROUTE_CHECK_VERCEL_IP || "76.76.21.21";
const REQUEST_TIMEOUT_MS = Number(process.env.ROUTE_CHECK_TIMEOUT_MS || 20000);
const MAX_ATTEMPTS = Number(process.env.ROUTE_CHECK_ATTEMPTS || 3);

const defaultMustNotContain = {
  public: [
    "<title>Admin Control — DONEOVERNIGHT</title>",
    "<title>COMMONPL4CE Website OS</title>",
    "Admin route not available. This route is protected and cannot fall through to the public website."
  ],
  booking: [
    "<title>Admin Control — DONEOVERNIGHT</title>",
    "<title>COMMONPL4CE Website OS</title>",
    "Admin route not available. This route is protected and cannot fall through to the public website."
  ],
  admin: [
    "<title>COMMONPL4CE | Campaign Archive</title>",
    "<title>Book a Shoot | COMMONPL4CE</title>",
    "<title>DONEOVERNIGHT — Submit before bed. Wake up to results.</title>"
  ],
  workspace: [
    "<title>Admin Control — DONEOVERNIGHT</title>",
    "Admin route not available. This route is protected and cannot fall through to the public website."
  ],
  api: [
    "<!DOCTYPE html>",
    "<html"
  ]
};

function readConfig() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error(`No routes defined in ${configPath}`);
  }
  return config;
}

function expectedStatuses(route) {
  return Array.isArray(route.expectedStatus) ? route.expectedStatus : [route.expectedStatus ?? 200];
}

function normalizeNeedles(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function requestOnce(urlString, { useVercelFallback = false, redirectCount = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const requestOptions = useVercelFallback
      ? {
          protocol: url.protocol,
          hostname: VERCEL_EDGE_FALLBACK_IP,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          servername: url.hostname,
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            "host": url.host,
            "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
            "accept-encoding": "identity",
            "user-agent": "DONEOVERNIGHT route safety gate/1.0"
          }
        }
      : {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
            "accept-encoding": "identity",
            "user-agent": "DONEOVERNIGHT route safety gate/1.0"
          }
        };
    const request = https.request(
      requestOptions,
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", async () => {
          const status = response.statusCode || 0;
          const location = response.headers.location;
          const shouldFollow = status >= 300 && status < 400 && location && redirectCount < 5;
          if (shouldFollow) {
            try {
              const nextUrl = new URL(location, url).toString();
              const redirected = await requestOnce(nextUrl, {
                useVercelFallback,
                redirectCount: redirectCount + 1
              });
              resolve({
                ...redirected,
                redirects: [urlString, ...(redirected.redirects || [])]
              });
            } catch (error) {
              reject(error);
            }
            return;
          }

          resolve({
            url: urlString,
            finalUrl: urlString,
            status,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            redirects: []
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    request.on("error", reject);
    request.end();
  });
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    for (const useVercelFallback of [false, true]) {
      try {
        return await requestOnce(url, { useVercelFallback });
      } catch (error) {
        lastError = error;
        if (!useVercelFallback && !/(ENOTFOUND|EAI_AGAIN|getaddrinfo|resolve|ECONNRESET|ETIMEDOUT)/i.test(String(error?.message || error))) {
          break;
        }
      }
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

function assertMarkers(route, response) {
  const failures = [];
  const body = response.body || "";
  const expected = expectedStatuses(route);
  if (!expected.includes(response.status)) {
    failures.push(`expected status ${expected.join(" or ")}, received ${response.status}`);
  }

  for (const marker of normalizeNeedles(route.mustContain)) {
    if (!body.includes(marker)) failures.push(`missing marker: ${JSON.stringify(marker)}`);
  }

  const routeTypeDefaults = route.skipDefaultMustNotContain ? [] : (defaultMustNotContain[route.routeType] || []);
  const mustNotContain = [...routeTypeDefaults, ...normalizeNeedles(route.mustNotContain)];
  for (const marker of mustNotContain) {
    if (body.includes(marker)) failures.push(`forbidden marker present: ${JSON.stringify(marker)}`);
  }

  return failures;
}

function assertSourceChecks(route) {
  const failures = [];
  for (const check of route.sourceChecks || []) {
    const targetFile = path.resolve(repoRoot, check.file);
    if (!targetFile.startsWith(repoRoot + path.sep)) {
      failures.push(`source check escapes repository: ${check.file}`);
      continue;
    }
    if (!fs.existsSync(targetFile)) {
      failures.push(`source check file missing: ${check.file}`);
      continue;
    }
    const source = fs.readFileSync(targetFile, "utf8");
    for (const marker of normalizeNeedles(check.mustContain)) {
      if (!source.includes(marker)) failures.push(`${check.file} missing source marker: ${JSON.stringify(marker)}`);
    }
    for (const marker of normalizeNeedles(check.mustNotContain)) {
      if (source.includes(marker)) failures.push(`${check.file} contains forbidden source marker: ${JSON.stringify(marker)}`);
    }
  }
  return failures;
}

async function checkRoute(route, index) {
  const label = `${index + 1}. ${route.url}`;
  const response = await fetchWithRetry(route.url);
  const failures = [
    ...assertMarkers(route, response),
    ...assertSourceChecks(route)
  ];

  if (failures.length) {
    return {
      ok: false,
      label,
      route,
      response,
      failures
    };
  }

  return {
    ok: true,
    label,
    route,
    response,
    failures: []
  };
}

async function main() {
  const config = readConfig();
  const results = [];

  console.log(`Checking ${config.routes.length} production routes from ${path.relative(repoRoot, configPath)}\n`);

  for (const [index, route] of config.routes.entries()) {
    try {
      const result = await checkRoute(route, index);
      results.push(result);
      const status = result.ok ? "PASS" : "FAIL";
      const finalInfo = result.response.finalUrl && result.response.finalUrl !== route.url
        ? ` -> ${result.response.finalUrl}`
        : "";
      console.log(`${status} ${result.label} [${result.response.status}]${finalInfo}`);
      if (!result.ok) {
        for (const failure of result.failures) console.log(`  - ${failure}`);
      }
    } catch (error) {
      results.push({ ok: false, label: `${index + 1}. ${route.url}`, route, failures: [String(error?.message || error)] });
      console.log(`FAIL ${index + 1}. ${route.url}`);
      console.log(`  - ${String(error?.message || error)}`);
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRoute safety result: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const result of failed) {
      console.log(`- ${result.label}`);
      for (const failure of result.failures) console.log(`  - ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
