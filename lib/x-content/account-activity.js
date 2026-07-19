const repository = require("./repository");
const xClient = require("./x-client");

const SYNC_SETTING = "x_account_activity_sync";
const MAX_PAGES = 100;
const PAGE_SIZE = 100;
const TIMEZONE = "Europe/Amsterdam";

function parse(value, fallback = {}) { try { return JSON.parse(value); } catch { return fallback; } }
function localDay(value, timeZone = TIMEZONE) { return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(value)); }
function isRepost(post = {}) { return Array.isArray(post.referenced_tweets) && post.referenced_tweets.some((reference) => reference?.type === "retweeted"); }
function isReply(post = {}) { return Boolean(post.in_reply_to_user_id) || (Array.isArray(post.referenced_tweets) && post.referenced_tweets.some((reference) => reference?.type === "replied_to")); }
function classification(post = {}, agentPostIds = new Set()) { if (isRepost(post)) return "repost"; if (isReply(post)) return "reply"; return agentPostIds.has(String(post.id)) ? "agent_original" : "manual_original"; }
function publicationOrigin(post = {}, agentPostIds = new Set()) { return agentPostIds.has(String(post.id)) ? "agent" : (!isReply(post) && !isRepost(post) ? "manual" : "unknown"); }
function activityRow(post, { accountId, agentPostIds, existing, now }) {
  const postClassification = classification(post, agentPostIds);
  return { x_post_id: String(post.id), account_id: String(accountId), text: String(post.text || ""), created_at: post.created_at || new Date(now).toISOString(), classification: postClassification, publication_origin: publicationOrigin(post, agentPostIds), ingestion_source: "authenticated_timeline", is_reply: postClassification === "reply", is_repost: postClassification === "repost", is_currently_visible: true, discovered_at: existing?.discovered_at || new Date(now).toISOString(), last_seen_at: new Date(now).toISOString() };
}
function activitySummary(records = [], { now = Date.now(), timeZone = TIMEZONE, status = {} } = {}) {
  const everSynced = Boolean(status.last_success_at || status.last_synced_at);
  if (!everSynced) return { posts_today: null, known_total_posts: null, agent_published_today: null, manual_posts_today: null, replies_today: null, reposts_today: null, last_x_sync: null, stale: true, never_synced: true, sync_error: status.error || null, history_limited: Boolean(status.history_limited) };
  const current = records.filter((record) => record?.is_currently_visible !== false); const today = localDay(now, timeZone); const original = current.filter((record) => !record.is_reply && !record.is_repost); const todayOriginal = original.filter((record) => localDay(record.created_at, timeZone) === today);
  const normalizedAgentToday = todayOriginal.filter((record) => ["agent", "agent_original"].includes(record.publication_origin)).length;
  return { posts_today: todayOriginal.length, known_total_posts: original.length, agent_published_today: normalizedAgentToday, manual_posts_today: Math.max(0, todayOriginal.length - normalizedAgentToday), replies_today: current.filter((record) => record.is_reply && localDay(record.created_at, timeZone) === today).length, reposts_today: current.filter((record) => record.is_repost && localDay(record.created_at, timeZone) === today).length, last_x_sync: status.last_success_at || status.last_synced_at || null, stale: status.status === "stale", never_synced: false, sync_error: status.error || null, history_limited: Boolean(status.history_limited) };
}
function sanitizedError(error) { return String(error?.code || error?.message || "X account activity sync failed").replace(/[\r\n]/g, " ").slice(0, 240); }
async function timeline(client, userId) {
  const posts = []; const seen = new Set(); let paginationToken = null; let historyLimited = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await client.getUserPosts(userId, { maxResults: PAGE_SIZE, paginationToken }); const payload = response?.data || {};
    for (const post of payload.data || []) if (post?.id && !seen.has(String(post.id))) { seen.add(String(post.id)); posts.push(post); }
    paginationToken = payload.meta?.next_token || null;
    if (!paginationToken) break;
    if (page === MAX_PAGES - 1) historyLimited = true;
  }
  return { posts, historyLimited };
}
async function syncAccountActivity(options = {}) {
  const repo = options.repository || repository; const client = options.xClient || xClient; const now = options.now || Date.now(); const timeZone = options.timeZone || TIMEZONE;
  let existing;
  try { existing = await repo.listAccountActivity(1000); }
  catch (error) {
    if (error.statusCode === 404) return { schema_pending: true, migration: "20260720_x_account_activity.sql", synced: false };
    return { synced: false, stale: true, posts_today: null, known_total_posts: null, agent_published_today: null, manual_posts_today: null, replies_today: null, reposts_today: null, last_x_sync: null, sync_error: sanitizedError(error), error: sanitizedError(error), code: error.code || null };
  }
  const previous = parse((await repo.getSetting(SYNC_SETTING).catch(() => null))?.value, {});
  try {
    const identity = await client.verifyIdentity();
    if (String(identity?.username || "").toLowerCase() !== "doneovernight") { const error = new Error("X identity guard failed: expected @doneovernight"); error.code = "X_USERNAME_GUARD_FAILED"; throw error; }
    const [publications, fetched] = await Promise.all([repo.listPublishedPublications(500), timeline(client, identity.userId)]); const agentPostIds = new Set((publications || []).map((publication) => String(publication.x_post_id || "")).filter(Boolean)); const known = new Map((existing || []).map((record) => [String(record.x_post_id), record])); const rows = fetched.posts.map((post) => activityRow(post, { accountId: identity.userId, agentPostIds, existing: known.get(String(post.id)), now }));
    await repo.markAccountActivityNotCurrent();
    for (let index = 0; index < rows.length; index += PAGE_SIZE) await repo.upsertAccountActivity(rows.slice(index, index + PAGE_SIZE));
    const status = { status: "current", last_synced_at: new Date(now).toISOString(), last_success_at: new Date(now).toISOString(), error: null, history_limited: fetched.historyLimited, authenticated_username: identity.username }; await repo.setSetting(SYNC_SETTING, JSON.stringify(status));
    return { synced: true, identity: { username: identity.username, user_id: identity.userId }, ...activitySummary(rows, { now, timeZone, status }), records: rows.length };
  } catch (error) {
    const status = { ...previous, status: "stale", error: sanitizedError(error), last_error_at: new Date(now).toISOString() }; await repo.setSetting(SYNC_SETTING, JSON.stringify(status)).catch(() => null);
    return { synced: false, ...activitySummary(existing || [], { now, timeZone, status }), error: status.error, code: error.code || null };
  }
}

async function recordAgentPublication({ xPostId, accountId, text, publishedAt = new Date().toISOString() }, options = {}) {
  if (!/^\d+$/.test(String(xPostId || "")) || !accountId) return null;
  const repo = options.repository || repository; const now = options.now || Date.now();
  const row = { x_post_id: String(xPostId), account_id: String(accountId), text: String(text || ""), created_at: publishedAt, classification: "agent_original", publication_origin: "agent", ingestion_source: "agent_publish", is_reply: false, is_repost: false, is_currently_visible: true, discovered_at: new Date(now).toISOString(), last_seen_at: new Date(now).toISOString() };
  await repo.upsertAccountActivity([row]);
  return row;
}

module.exports = { MAX_PAGES, PAGE_SIZE, SYNC_SETTING, TIMEZONE, activityRow, activitySummary, classification, publicationOrigin, isReply, isRepost, localDay, recordAgentPublication, syncAccountActivity };
