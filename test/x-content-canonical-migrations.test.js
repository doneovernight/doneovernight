const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = (name) => fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", name),
  "utf8"
);

test("gate-audit migration derives tenant ownership and fails closed", () => {
  const sql = migration("20260724_x_gate_audit.sql");
  assert.match(sql, /set workspace_id = draft\.workspace_id/);
  assert.match(sql, /set workspace_id = candidate\.workspace_id/);
  assert.match(sql, /set workspace_id = run\.workspace_id/);
  assert.match(sql, /have no relationship-derived workspace_id/);
  assert.match(sql, /foreign key \(workspace_id\) references public\.workspaces\(id\)/);
  assert.match(sql, /unique index if not exists x_gate_audits_workspace_key_idx/);
  assert.doesNotMatch(sql, /where slug = 'x-automatic-poster'/);
  assert.doesNotMatch(sql, /set workspace_id = \$1/);
});

test("daily execution migration never assigns a seeded global workspace", () => {
  const sql = migration("20260725_x_daily_execution_plan.sql");
  assert.doesNotMatch(sql, /seeded_workspace/);
  assert.doesNotMatch(sql, /where slug = 'x-automatic-poster'/);
  assert.doesNotMatch(sql, /select \$1,/);
  assert.match(sql, /select distinct candidate\.workspace_id/);
  assert.match(sql, /select distinct draft\.workspace_id/);
  assert.match(sql, /select distinct schedule\.workspace_id/);
  assert.match(sql, /select distinct publication\.workspace_id/);
});

test("canonical lifecycle joins and foreign keys are tenant-safe", () => {
  const sql = migration("20260725_x_daily_execution_plan.sql");
  for (const predicate of [
    /schedule_row\.workspace_id = draft\.workspace_id/,
    /publication_row\.workspace_id = draft\.workspace_id/,
    /gate_row\.workspace_id = draft\.workspace_id/,
    /decision_row\.workspace_id = draft\.workspace_id/,
    /plan\.workspace_id = links\.workspace_id/,
    /item\.workspace_id = schedule\.workspace_id/
  ]) assert.match(sql, predicate);

  for (const reference of [
    "workspace_candidate_fkey",
    "workspace_draft_fkey",
    "workspace_gate_audit_fkey",
    "workspace_decision_fkey",
    "workspace_schedule_fkey",
    "workspace_publication_fkey",
    "workspace_plan_item_fkey"
  ]) assert.match(sql, new RegExp(reference));
  assert.doesNotMatch(sql, /check \(execution_plan_item_id is not null\)/i);
  assert.match(sql, /compatibility-mode[\s\S]*legacy scheduler/i);
});

test("canonical schedule backfill preserves every production lifecycle state", () => {
  const sql = migration("20260725_x_daily_execution_plan.sql");
  assert.match(sql, /schedule\.status as schedule_status/);
  assert.match(sql, /publication\.status as publication_status/);
  assert.match(sql, /publication_status = 'published' then 'published'/);
  assert.match(sql, /schedule_status in \('scheduled', 'due', 'delayed'\) then 'scheduled'/);
  assert.match(sql, /schedule_status = 'publishing' then 'publishing'/);
  assert.match(sql, /schedule_status = 'failed' then 'failed'/);
  assert.match(sql, /schedule_status = 'shadow' then 'evaluated'/);
  assert.match(sql, /schedule_status in \('canceled', 'cancelled', 'missed', 'superseded', 'published'\) then 'blocked'/);
  assert.match(sql, /schedule\.status in \('scheduled', 'due', 'delayed'\) then 'scheduled'/);
  assert.match(sql, /schedule\.status = 'shadow' then 'evaluated'/);
  assert.match(sql, /schedule\.status in \('canceled', 'cancelled', 'missed', 'superseded', 'published'\) then 'blocked'/);
});

test("canonical migrations are additive and preserve records", () => {
  const sql = `${migration("20260724_x_gate_audit.sql")}\n${migration("20260725_x_daily_execution_plan.sql")}`;
  assert.match(sql, /add column if not exists/i);
  assert.match(sql, /create (?:unique )?index if not exists/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant select, insert, update, delete on table/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
  assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
});
