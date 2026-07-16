const repository = require("./repository");
const xClient = require("./x-client");
const { getConfig } = require("./config");
const { generateReplyDraft } = require("./generate");
const { classifyInteraction } = require("./editorial");
const { validatePostText } = require("./validation");

function usersById(includes = {}) { return new Map((includes.users || []).map((user) => [user.id, user])); }
function eventRecord(post, type, publication, users, accountId) {
  if (!post?.id || post.author_id === accountId) return null;
  const author = users.get(post.author_id) || {};
  return { x_event_id: post.id, interaction_type: type, publication_id: publication?.id || null, source_draft_id: publication?.draft_id || null, author_id: post.author_id || null, author_username: author.username || null, text: String(post.text || "").slice(0, 4000), classification: classifyInteraction(post.text), related_post_text: publication?.draft_text || null, created_at_x: post.created_at || null, received_at: new Date().toISOString(), raw_metrics: post.public_metrics || {} };
}

async function generateReply(record, config, options = {}) {
  const repo = options.repository || repository; const generator = options.generateReplyDraft || generateReplyDraft;
  if (record.classification === "spam") return { skipped: "spam" };
  const generated = await generator(record, config);
  const validation = validatePostText(generated.reply_text);
  if (!validation.ok || validation.weighted > 240 || Number(generated.confidence) < config.editorialThreshold) return { skipped: "reply_quality_gate" };
  const draft = await repo.createReplyDraft({ interaction_id: record.id, source_draft_id: record.source_draft_id, text: generated.reply_text.trim(), weighted_character_count: validation.weighted, classification: record.classification, confidence: generated.confidence, status: "queued", model_output: generated });
  await repo.updateInteraction(record.id, { status: "drafted" });
  return { draft };
}

async function collectEngagement(options = {}) {
  const repo = options.repository || repository; const client = options.xClient || xClient; const config = options.config || getConfig(); const result = { mentions: 0, replies: 0, quotes: 0, reply_drafts: 0, skipped: [] };
  const identity = await client.verifyIdentity(); const publications = await repo.listPublishedPublications();
  const mentions = await client.getMentions(identity.userId); const mentionUsers = usersById(mentions.data.includes);
  const events = (mentions.data.data || []).map((post) => eventRecord(post, post.in_reply_to_user_id === identity.userId ? "reply" : "mention", null, mentionUsers, identity.userId)).filter(Boolean);
  result.mentions = events.filter((event) => event.interaction_type === "mention").length; result.replies = events.filter((event) => event.interaction_type === "reply").length;
  for (const publication of publications.slice(0, 20)) {
    const [replyResponse, quoteResponse] = await Promise.all([client.getReplies(publication.x_post_id), client.getQuotes(publication.x_post_id)]);
    const replyUsers = usersById(replyResponse.data.includes); const quoteUsers = usersById(quoteResponse.data.includes);
    for (const post of replyResponse.data.data || []) { if (post.id !== publication.x_post_id) { const record = eventRecord(post, "reply", publication, replyUsers, identity.userId); if (record) events.push(record); } }
    for (const post of quoteResponse.data.data || []) { const record = eventRecord(post, "quote", publication, quoteUsers, identity.userId); if (record) events.push(record); }
  }
  result.replies = events.filter((event) => event.interaction_type === "reply").length; result.quotes = events.filter((event) => event.interaction_type === "quote").length;
  for (const event of events) {
    const created = await repo.createInteraction(event);
    if (!created) continue;
    const reply = await generateReply(created, config, options); if (reply.draft) result.reply_drafts += 1; else result.skipped.push(reply.skipped);
  }
  return result;
}

async function collectAnalytics(options = {}) {
  const repo = options.repository || repository; const client = options.xClient || xClient; const result = { snapshots: 0, skipped: [] };
  const user = await client.getUserMetrics(); const followers = Number(user.data?.data?.public_metrics?.followers_count);
  const publications = await repo.listPublishedPublications();
  for (const publication of publications.slice(0, 20)) {
    const metrics = await client.getPostMetrics(publication.x_post_id); const data = metrics.data?.data || {}; const publicMetrics = data.public_metrics || {}; const privateMetrics = data.non_public_metrics || data.organic_metrics || {};
    const previous = await repo.latestAnalytics(publication.id); const priorFollowers = Number(previous?.follower_count); const gained = Number.isFinite(followers) && Number.isFinite(priorFollowers) ? Math.max(0, followers - priorFollowers) : null;
    await repo.createAnalytics({ publication_id: publication.id, x_post_id: publication.x_post_id, recorded_at: new Date().toISOString(), views: publicMetrics.impression_count ?? null, likes: publicMetrics.like_count ?? null, replies: publicMetrics.reply_count ?? null, quotes: publicMetrics.quote_count ?? null, reposts: publicMetrics.retweet_count ?? null, bookmarks: publicMetrics.bookmark_count ?? null, profile_visits: privateMetrics.user_profile_clicks ?? null, follower_count: Number.isFinite(followers) ? followers : null, followers_gained_after_post: gained, raw_metrics: { public: publicMetrics, private: privateMetrics } });
    result.snapshots += 1;
  }
  return result;
}

module.exports = { classifyInteraction, collectAnalytics, collectEngagement, eventRecord, generateReply };
