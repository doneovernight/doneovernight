const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.join(__dirname, "../.github/workflows/x-content-schedule.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

function job(name) {
  const marker = `  ${name}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow job ${name} should exist`);
  const tail = workflow.slice(start + marker.length);
  const next = tail.search(/^  [a-z0-9_]+:\n/m);
  return next === -1 ? tail : tail.slice(0, next);
}

test("the discovery core follows discovery -> canonical plan -> autonomy", () => {
  const discovery = job("discovery");
  const canonicalPlan = job("canonical_plan_after_discovery");

  assert.match(discovery, /api\/x-content-discover\b/);
  assert.doesNotMatch(discovery, /api\/x-content-(?:daily-plan|autonomy|radar|engagement|autonomy-metrics|growth)\b/);

  assert.match(canonicalPlan, /needs: discovery/);
  assert.match(canonicalPlan, /needs\.discovery\.result == 'success'/);
  assert.match(canonicalPlan, /api\/x-content-daily-plan\b/);
  assert.match(canonicalPlan, /api\/x-content-autonomy\b/);
  assert.ok(
    canonicalPlan.indexOf("/api/x-content-daily-plan") < canonicalPlan.indexOf("/api/x-content-autonomy"),
    "canonical planning must complete before autonomy evaluates or schedules it"
  );
  assert.doesNotMatch(workflow, /^  autonomy_after_canonical_plan:/m);
});

test("all canonical plan mutations share one non-cancelling lock", () => {
  for (const name of ["daily_plan", "canonical_plan_after_discovery", "autonomy"]) {
    const section = job(name);
    assert.match(section, /concurrency:\n\s+group: x-content-canonical-plan\n\s+cancel-in-progress: false/);
  }

  assert.doesNotMatch(job("publishing"), /group: x-content-canonical-plan/);
});

test("each discovery enrichment runs in an isolated job", () => {
  const enrichments = {
    radar_after_discovery: "x-content-radar",
    engagement_after_discovery: "x-content-engagement",
    autonomy_metrics_after_discovery: "x-content-autonomy-metrics",
    growth_after_discovery: "x-content-growth"
  };

  for (const [name, route] of Object.entries(enrichments)) {
    const section = job(name);
    assert.match(section, /needs: discovery/);
    assert.match(section, /needs\.discovery\.result == 'success'/);
    assert.match(section, new RegExp(`api/${route}\\b`));
    for (const otherRoute of Object.values(enrichments).filter((value) => value !== route)) {
      assert.doesNotMatch(section, new RegExp(`api/${otherRoute}\\b`));
    }
  }
});

test("publishing remains an independent fifteen-minute job", () => {
  const publishing = job("publishing");
  assert.match(workflow, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(publishing, /github\.event\.schedule == '\*\/15 \* \* \* \*'/);
  assert.match(publishing, /api\/x-content-autonomy-publish\b/);
  assert.doesNotMatch(publishing, /\bneeds:/);
});

test("manual enrichment tasks remain independently dispatchable", () => {
  assert.match(workflow, /options: \[[^\]]*radar[^\]]*engagement[^\]]*growth[^\]]*autonomy_metrics[^\]]*\]/);
  assert.match(job("radar"), /inputs\.task == 'radar'/);
  assert.match(job("engagement"), /inputs\.task == 'engagement'/);
  assert.match(job("growth"), /inputs\.task == 'growth'/);
  assert.match(job("autonomy_metrics"), /inputs\.task == 'autonomy_metrics'/);
});

test("HTTP failures retain sanitized response bodies for workflow diagnostics", () => {
  const curlCommands = workflow.match(/^\s+curl .+$/gm) || [];
  assert.ok(curlCommands.length > 0);
  for (const command of curlCommands) {
    assert.match(command, /--fail-with-body/);
  }
  assert.doesNotMatch(workflow, /-o \/dev\/null/);
  assert.doesNotMatch(workflow, /curl --fail(?:\s|$)/);
});
