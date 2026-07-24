const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const scheduler = require("../lib/x-content/scheduler");
const service = require("../lib/x-content/service");

const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260726_x_primary_scheduler.sql"), "utf8");
const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/x-content-schedule.yml"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "../admin/x-content/index.html"), "utf8");

test("scheduler metadata is server-normalized and five-minute idempotent", () => {
  const now = Date.parse("2026-07-24T12:07:31.000Z");
  const first = scheduler.triggerFromRequest({ headers: { "x-scheduler-source": "supabase_pg_cron", "x-scheduler-intended-at": "2026-07-24T12:05:00.000Z" } }, now);
  const retry = scheduler.triggerFromRequest({ headers: { "x-scheduler-source": "supabase_pg_cron", "x-scheduler-intended-at": "2026-07-24T12:05:45.000Z" } }, now);
  assert.equal(first.source, "supabase_pg_cron");
  assert.equal(first.delayMs, 151000);
  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  const untrusted = scheduler.triggerFromRequest({ headers: { "x-scheduler-source": "attacker", "x-scheduler-intended-at": "secret" } }, now);
  assert.equal(untrusted.source, "internal_manual");
  assert.match(untrusted.idempotencyKey, /^autonomy_publish:internal_manual:/);
});

test("scheduler telemetry exposes primary timing and watchdog state", () => {
  const now = Date.parse("2026-07-24T12:09:00.000Z");
  const status = scheduler.primaryStatus([
    { scheduler_source: "supabase_pg_cron", actual_trigger_at: "2026-07-24T12:05:04.000Z", delay_ms: 4000, status: "completed" },
    { scheduler_source: "github_watchdog", actual_trigger_at: "2026-07-24T12:06:00.000Z", status: "skipped", result: { reason: "primary_current" } }
  ], now);
  assert.equal(status.primary, "Supabase pg_cron");
  assert.equal(status.primary_current, true);
  assert.equal(status.next_expected_run, "2026-07-24T12:10:04.000Z");
  assert.equal(status.scheduler_delay_seconds, 4);
  assert.equal(status.fallback_state, "standby");
});

test("database scheduler migration keeps the secret in Vault and claims one shared lease", () => {
  assert.match(migration, /create extension if not exists pg_cron/);
  assert.match(migration, /create extension if not exists pg_net with schema extensions/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /unique \(workspace_id, idempotency_key\)/);
  assert.match(migration, /primary key \(workspace_id, lease_name\)/);
  assert.match(migration, /create or replace function public\.claim_x_scheduler_run/);
  assert.match(migration, /on conflict \(workspace_id, lease_name\) do update/);
  assert.match(migration, /cron\.schedule\([\s\S]*'\*\/5 \* \* \* \*'/);
  assert.match(migration, /'select public\.invoke_x_publisher_scheduler\(\);'/);
  assert.doesNotMatch(migration, /Bearer\s+[A-Za-z0-9._-]{16,}/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.x_/i);
  assert.doesNotMatch(migration, /truncate/i);
});

test("duplicate and overlapping scheduler claims never enter the publisher", async () => {
  let coreCalls = 0;
  const duplicateRepo = { claimSchedulerRun: async () => ({ run_id: "same", claimed: false, disposition: "duplicate" }) };
  const duplicate = await service.schedulerPublishingCheck({ repository: duplicateRepo, trigger: { source: "supabase_pg_cron", idempotencyKey: "same" }, processScheduled: async () => { coreCalls += 1; } });
  assert.equal(duplicate.skipped, "duplicate");
  assert.equal(coreCalls, 0);
  const overlapRepo = { claimSchedulerRun: async () => ({ run_id: "overlap", claimed: false, disposition: "overlapping_trigger" }) };
  const overlap = await service.schedulerPublishingCheck({ repository: overlapRepo, trigger: { source: "github_watchdog", idempotencyKey: "overlap" }, processScheduled: async () => { coreCalls += 1; } });
  assert.equal(overlap.skipped, "overlapping_trigger");
  assert.equal(coreCalls, 0);
});

test("a current primary tick keeps the GitHub watchdog on standby", async () => {
  let coreCalls = 0; const finished = []; let releases = 0;
  const repo = {
    claimSchedulerRun: async () => ({ run_id: "watchdog", claimed: true, disposition: "claimed" }),
    listSchedulerRuns: async () => [{ scheduler_source: "supabase_pg_cron", actual_trigger_at: new Date().toISOString(), status: "completed", delay_ms: 20 }],
    finishSchedulerRun: async (...args) => { finished.push(args); },
    releaseSchedulerLease: async () => { releases += 1; }
  };
  const result = await service.schedulerPublishingCheck({ repository: repo, trigger: { source: "github_watchdog", idempotencyKey: "watchdog" }, processScheduled: async () => { coreCalls += 1; } });
  assert.equal(result.skipped, "primary_current");
  assert.equal(coreCalls, 0);
  assert.equal(finished[0][1], "skipped");
  assert.equal(releases, 1);
});

test("primary and late-watchdog triggers use the existing canonical publisher once", async () => {
  for (const source of ["supabase_pg_cron", "github_watchdog"]) {
    let coreCalls = 0; const finished = []; let releases = 0;
    const repo = {
      claimSchedulerRun: async () => ({ run_id: `run-${source}`, claimed: true, disposition: "claimed" }),
      listSchedulerRuns: async () => [],
      createRun: async () => ({ id: "agent-run" }),
      finishRun: async () => null,
      finishSchedulerRun: async (...args) => { finished.push(args); },
      releaseSchedulerLease: async () => { releases += 1; }
    };
    const result = await service.schedulerPublishingCheck({
      repository: repo,
      config: { mode: "approve", autonomy: { mode: "auto", publishEnabled: true } },
      trigger: { source, idempotencyKey: `key-${source}`, intendedTriggerAt: new Date().toISOString(), actualTriggerAt: new Date().toISOString(), delayMs: 0 },
      processScheduled: async () => { coreCalls += 1; return { published: false, skipped: "no_due_schedule" }; }
    });
    assert.equal(coreCalls, 1);
    assert.equal(result.published, false);
    assert.equal(finished[0][1], "completed");
    assert.equal(releases, 1);
  }
});

test("GitHub is a watchdog and Mission Control exposes primary telemetry", () => {
  assert.match(workflow, /GitHub is a watchdog only/);
  assert.match(workflow, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(workflow, /github\.event\.schedule == '\*\/15 \* \* \* \*'/);
  assert.match(workflow, /X-Scheduler-Source: \$\{SCHEDULER_SOURCE\}/);
  assert.match(workflow, /scheduler_install/);
  assert.doesNotMatch(workflow, /if: github\.event_name == 'schedule' \|\| inputs\.task == 'publishing'/);
  for (const label of ["Primary scheduler", "Last scheduler run", "Next expected run", "Scheduler delay", "Fallback"]) assert.match(admin, new RegExp(label));
});
