# Workspace-scoped content strategy (Phase 2 contract)

Phase 1 establishes the workspace ownership boundary only. It does not create
strategy tables, a strategy engine, onboarding, or client UI. All current
topic-bearing records already carry `workspace_id`, and their natural-key
indexes are workspace-scoped so two workspaces may use the same topic or source.

## Planned typed model

Phase 2 should add these typed relations, each with a required `workspace_id`
foreign key and workspace-local natural keys:

- `workspace_content_strategies`: primary niche, secondary niches, audience,
  audience expertise level, geography, language, business objectives,
  promotional boundaries, topic priority weights, content-type mix, seasonal
  and campaign topics.
- `workspace_content_pillars`: named pillars, descriptions, priority, and
  active windows.
- `workspace_topic_preferences`: preferred topics, weights, content types, and
  active windows.
- `workspace_topic_exclusions`: excluded topics/patterns, reasons, and active
  windows.
- `workspace_source_preferences`: trusted sources, trusted X accounts,
  excluded domains, competitor accounts, and keyword watchlists.

Secrets and OAuth tokens do not belong in these tables. Credentials remain a
separate server-only, envelope-encrypted model planned for the later OAuth
phase.

## Phase 2 consumption contract

Before discovery, drafting, scheduling, analytics, or learning runs, the
server resolves the active workspace from the authenticated membership and
loads one immutable strategy snapshot. The snapshot is passed through the
existing tenant context and every repository call remains explicitly scoped by
`workspace_id`. A missing, inactive, ambiguous, or unauthorized workspace
fails closed. Topic scoring, source selection, content-type mix, cadence, and
learning updates read this snapshot; no process falls back to global
`x_settings` or DONEOVERNIGHT-wide topics.

Strategy changes are versioned and auditable. Existing records retain their
workspace and historical strategy version, so a later strategy change cannot
rewrite prior candidates, drafts, publications, analytics, or learning data.
