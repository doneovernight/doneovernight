const repository = require("./repository");
const { getConfig, ALLOWED_MODES } = require("./config");
const { fetchSource, REGISTRY } = require("./sources");
const { generateDraft } = require("./generate");
const { normalizeText, validatePostText, validateSource, scoreCandidate, isWithinPublishingWindow } = require("./validation");
const xClient = require("./x-client");
const { sendTelegramMessage } = require("../../heartbeat/telegram");

function jaccard(a, b) { const left = new Set(normalizeText(a).split(" ").filter((word) => word.length > 2)); const right = new Set(normalizeText(b).split(" ").filter((word) => word.length > 2)); const union = new Set([...left, ...right]); return union.size ? [...left].filter((word) => right.has(word)).length / union.size : 0; }
function dateKey(date, timeZone) { return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date); }
async function notify(text) { return sendTelegramMessage({ botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.HEARTBEAT_TELEGRAM_CHAT_ID, text }).catch(() => ({ sent: false })); }
async function operationalConfig() { const base = getConfig(); const saved = await repository.getSetting("content_publish_mode").catch(() => null); return { ...base, mode: ALLOWED_MODES.has(saved?.value) ? saved.value : base.mode }; }

async function discover() {
  const config = await operationalConfig(); const run = await repository.createRun("discovery"); const summary = { checked: 0, candidates: 0, rejected: 0, drafts: 0, failures: [] };
  try {
    const known = await repository.recentCandidates();
    for (const source of REGISTRY) {
      try {
        const items = await fetchSource(source); summary.checked += 1;
        for (const item of items.slice(0, 12)) {
          const sourceValidation = validateSource({ url: item.sourceUrl, title: item.title, publisher: item.publisher, evidenceSummary: item.summary, confidence: item.authority });
          const age = Date.now() - new Date(item.publishedAt).getTime(); const existing = known.find((row) => row.source_url === item.sourceUrl);
          if (!sourceValidation.ok || age > 7 * 86_400_000 || existing) { summary.rejected += 1; continue; }
          const scores = scoreCandidate(item); const similar = known.some((row) => row.topic_cluster && jaccard(row.headline, item.title) >= 0.82);
          if (similar || scores.overall < config.publicationThreshold) { summary.rejected += 1; continue; }
          const sourceRow = await repository.recordSource({ source_url: item.sourceUrl, title: item.title, publisher: item.publisher, published_at: new Date(item.publishedAt).toISOString(), retrieved_at: new Date().toISOString(), evidence_summary: item.summary, confidence: item.authority });
          const candidate = await repository.createCandidate({ source_id: sourceRow?.id || null, source_url: item.sourceUrl, headline: item.title, topic_cluster: item.publisher.toLowerCase(), entities: [item.publisher], source_references: [item.sourceUrl], relevance_score: scores.relevance, recency_score: scores.recency, authority_score: scores.authority, novelty_score: scores.novelty, fit_score: scores.fit, publish_score: scores.overall, status: "accepted", evidence_summary: item.summary });
          known.push(candidate); summary.candidates += 1;
          if (summary.drafts < 2) {
            try {
              let generated = await generateDraft({ ...candidate, publisher: item.publisher, summary: item.summary, title: item.title, sourceUrl: item.sourceUrl }, config);
              let validation = validatePostText(generated.post_text); let rewrites = 0;
              while (validation.weighted > 280 && rewrites < 2) { generated = await generateDraft({ ...candidate, publisher: item.publisher, summary: item.summary, title: item.title, sourceUrl: item.sourceUrl }, config, generated.post_text); validation = validatePostText(generated.post_text); rewrites += 1; }
              const duplicateScore = Math.max(0, ...(await repository.recentDrafts()).map((draft) => jaccard(draft.text, generated.post_text)));
              const qualityScore = Math.round(((validation.ok ? 0.55 : 0) + Number(generated.confidence || 0) * 0.3 + (1 - duplicateScore) * 0.15) * 100) / 100;
              const status = validation.ok && duplicateScore < 0.82 && qualityScore >= 0.7 ? "queued" : "rejected";
              await repository.createDraft({ candidate_id: candidate.id, text: generated.post_text, weighted_character_count: validation.weighted, raw_character_count: validation.raw, post_type: generated.post_type, topic_cluster: generated.topic_cluster, source_references: [item.sourceUrl], confidence: generated.confidence, quality_score: qualityScore, duplicate_score: duplicateScore, mode: config.mode, status, rejection_reason: status === "rejected" ? [...validation.errors, validation.weighted > 280 ? "Rejected after two rewrites" : "", duplicateScore >= 0.82 ? "Duplicate draft" : ""].filter(Boolean).join("; ") : null, model_output: { ...generated, rewrite_attempts: rewrites } });
              if (status === "queued") { summary.drafts += 1; await notify(`DONEOVERNIGHT X: draft ready for ${config.mode === "approve" ? "approval" : "review"}. ${generated.post_type}, ${validation.weighted}/280.`); }
            } catch (error) { summary.failures.push(`generation: ${error.code || error.message}`); }
          }
        }
      } catch (error) { summary.failures.push(`${source.publisher}: ${error.message}`); }
    }
    if (!summary.candidates) await notify("DONEOVERNIGHT X: discovery completed with no viable topic.");
    await repository.finishRun(run.id, summary.failures.length ? "partial" : "completed", summary); return summary;
  } catch (error) { await repository.finishRun(run.id, "failed", summary, error.message); throw error; }
}

async function canPublish(draft, config) {
  const validation = validatePostText(draft.text); if (!validation.ok) return validation.errors.join("; ");
  if (!isWithinPublishingWindow(new Date(), config)) return "Outside configured publishing window";
  const publications = await repository.publicationsToday(); const today = dateKey(new Date(), config.timezone); const publishedToday = publications.filter((row) => dateKey(new Date(row.published_at), config.timezone) === today);
  if (publishedToday.length >= config.dailyCap) return "Daily posting cap reached";
  const latest = publications[0]; if (latest && Date.now() - new Date(latest.published_at).getTime() < config.minimumIntervalMinutes * 60_000) return "Minimum publishing interval has not elapsed";
  const duplicate = (await repository.recentDrafts()).some((row) => row.id !== draft.id && row.status === "published" && jaccard(row.text, draft.text) >= 0.82);
  if (duplicate) return "Duplicate post detected";
  return null;
}

async function publishNext({ dryRun = false } = {}) {
  const config = await operationalConfig(); const run = await repository.createRun("publishing"); const summary = { mode: config.mode, dryRun, published: false, skipped: null };
  try {
    if (config.mode === "draft") { summary.skipped = "Draft mode never publishes"; await repository.finishRun(run.id, "completed", summary); return summary; }
    const drafts = await repository.listPublishableDrafts(config.mode); const draft = drafts[0];
    if (!draft) { summary.skipped = "No eligible draft"; await repository.finishRun(run.id, "completed", summary); return summary; }
    const reason = await canPublish(draft, config); if (reason) { await repository.updateDraft(draft.id, { status: "rejected", rejection_reason: reason }); await notify(`DONEOVERNIGHT X: draft rejected by guardrail: ${reason}`); summary.skipped = reason; await repository.finishRun(run.id, "completed", summary); return summary; }
    if (dryRun) { summary.dryRunDraftId = draft.id; summary.identity = await xClient.verifyIdentity(); await repository.finishRun(run.id, "completed", summary); return summary; }
    const previous = await repository.getPublication(draft.id); if (previous?.x_post_id || previous?.status === "publishing") { summary.skipped = "Idempotency guard: draft was already attempted"; await repository.finishRun(run.id, "completed", summary); return summary; }
    await repository.createPublication(draft.id); const identity = await xClient.verifyIdentity(); const result = await xClient.publish(draft.text); const xPostId = result.data?.data?.id;
    if (!xPostId) throw new Error("X returned no post ID");
    const url = `https://x.com/${identity.username}/status/${xPostId}`;
    await repository.updatePublication(draft.id, { status: "published", x_post_id: xPostId, x_post_url: url, published_at: new Date().toISOString(), x_response_status: 201 });
    await repository.updateDraft(draft.id, { status: "published", published_at: new Date().toISOString(), x_post_id: xPostId, x_post_url: url });
    summary.published = true; summary.url = url; await notify(`DONEOVERNIGHT X: published ${url}`); await repository.finishRun(run.id, "completed", summary); return summary;
  } catch (error) { summary.error = error.code || error.message; await repository.finishRun(run.id, "failed", summary, error.message); if (error.category === "authentication") await notify("DONEOVERNIGHT X: authentication failure. Publishing is blocked."); throw error; }
}
async function approveDraft(id) { const draft = await repository.getDraft(id); if (!draft || draft.status !== "queued") throw new Error("Only queued drafts can be approved"); return repository.updateDraft(id, { status: "approved", approved_at: new Date().toISOString() }); }
async function rejectDraft(id, reason) { return repository.updateDraft(id, { status: "rejected", rejection_reason: String(reason || "Rejected by operator").slice(0, 400) }); }
async function testPost() { const config = await operationalConfig(); if (!config.allowTestPost) { const error = new Error("Test posting is disabled; set X_ALLOW_TEST_POST=true explicitly"); error.code = "X_TEST_POST_DISABLED"; throw error; } const identity = await xClient.verifyIdentity(); const text = "DONEOVERNIGHT X API connection test. This harmless post confirms official publishing access."; const result = await xClient.publish(text); return { username: identity.username, xPostId: result.data?.data?.id, text }; }
async function heartbeat() { const config = await operationalConfig(); const [discovery, publishing, drafts, publications] = await Promise.all([repository.latestRun("discovery"), repository.latestRun("publishing"), repository.recentDrafts(), repository.publicationsToday()]); return { lastSuccessfulDiscovery: discovery?.status === "completed" ? discovery.completed_at : null, lastGeneratedDraft: drafts[0]?.created_at || null, lastSuccessfulPublication: publications.find((item) => item.status === "published")?.published_at || null, currentMode: config.mode, postsPublishedToday: publications.filter((item) => item.status === "published").length, nextScheduledRun: "Discovery every 2 hours; publishing check every 15 minutes", latestError: [discovery, publishing].find((item) => item?.status === "failed")?.error_message || null }; }
module.exports = { discover, publishNext, approveDraft, rejectDraft, testPost, heartbeat, operationalConfig, canPublish, jaccard };
