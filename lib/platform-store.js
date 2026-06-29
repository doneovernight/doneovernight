const { clean, supabaseFetch } = require("./ops");

const PLATFORM_TABLES = {
  journeys: "journeys",
  viewerBuilds: "viewer_builds",
  resourceInterest: "resource_interest",
  journal: "journal",
  liveStatus: "live_status",
  visitorProgress: "visitor_progress",
  emailEvents: "email_events",
  followEvents: "follow_events",
  pageEvents: "page_events",
  shareEvents: "share_events"
};

function asArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const item = clean(value);
  return item ? [item] : [];
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeJourneyId(input = {}) {
  return clean(input.journey_id || input.journeyId || input.journey?.journey_id || input.journey?.journeyId);
}

function parseUtm(input = {}) {
  const utm = input.utm && typeof input.utm === "object" ? input.utm : {};
  return {
    utm_source: clean(input.utm_source || input.utmSource || utm.source || utm.utm_source),
    utm_medium: clean(input.utm_medium || input.utmMedium || utm.medium || utm.utm_medium),
    utm_campaign: clean(input.utm_campaign || input.utmCampaign || utm.campaign || utm.utm_campaign)
  };
}

function deviceFromUserAgent(userAgent = "") {
  const value = clean(userAgent).toLowerCase();
  if (!value) return "";
  if (/iphone|android.+mobile|mobile/.test(value)) return "mobile";
  if (/ipad|tablet/.test(value)) return "tablet";
  return "desktop";
}

function supabaseNotReady(error = {}) {
  const detail = String(error.detail || error.message || "").toLowerCase();
  return error.code === "SUPABASE_NOT_CONFIGURED" ||
    detail.includes("not configured") ||
    detail.includes("schema cache") ||
    detail.includes("could not find") ||
    detail.includes("does not exist") ||
    detail.includes("relation");
}

function platformResult(saved, reason = "") {
  return { configured: true, saved: saved === true, status: saved ? "saved" : "failed", reason };
}

function platformUnavailable(error = {}) {
  if (error.code === "SUPABASE_NOT_CONFIGURED" || String(error.message || "").includes("not configured")) {
    return { configured: false, saved: false, status: "not_configured", reason: "supabase_not_configured" };
  }
  return {
    configured: true,
    saved: false,
    status: "failed",
    reason: supabaseNotReady(error) ? "table_not_ready" : "supabase_failed"
  };
}

async function safeSupabase(path, options = {}) {
  return supabaseFetch(path, options);
}

function omitEmpty(record = {}) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
}

async function upsertJourney(input = {}, context = {}) {
  const journeyId = normalizeJourneyId(input);
  if (!journeyId) return { configured: true, saved: false, status: "skipped", reason: "missing_journey_id" };
  const utm = parseUtm(input);
  const now = new Date().toISOString();
  const record = omitEmpty({
    journey_id: journeyId,
    email: clean(input.email).toLowerCase(),
    social_handle: clean(input.social_handle || input.socialHandle),
    source: clean(input.source) || "unknown",
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    browser_language: clean(input.browser_language || input.browserLanguage || context.browserLanguage),
    device: clean(input.device) || deviceFromUserAgent(context.userAgent),
    started_at: clean(input.started_at || input.startedAt || input.journey_started_at || input.journeyStartedAt) || now,
    completed_at: asNumber(input.completion_percentage ?? input.completion, 0) >= 100 ? now : null,
    completion_percentage: asNumber(input.completion_percentage ?? input.completion, 0),
    chosen_path: clean(input.chosen_path || input.chosenPath),
    chosen_interests: asArray(input.chosen_interests || input.chosenInterests),
    builder_result: clean(input.builder_result || input.result),
    automation_choice: asArray(input.automation_choice || input.automationChoice || input.automate).join(", "),
    time_spent: asNumber(input.time_spent || input.timeSpent, 0),
    returned: asBoolean(input.returned),
    profile_copied: asBoolean(input.profile_copied || input.profileCopied),
    share_clicked: asBoolean(input.share_clicked || input.shareClicked),
    follow_clicked: asBoolean(input.follow_clicked || input.followClicked),
    last_page: clean(input.last_page || input.lastPage || context.page),
    updated_at: new Date().toISOString()
  });

  try {
    await safeSupabase(`${PLATFORM_TABLES.journeys}?on_conflict=journey_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(record)
    });
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveVisitorProgress(input = {}) {
  const journeyId = normalizeJourneyId(input);
  if (!journeyId) return { configured: true, saved: false, status: "skipped", reason: "missing_journey_id" };
  const record = {
    journey_id: journeyId,
    active_step: asNumber(input.active_step || input.activeStep, 1),
    unlocked_step: asNumber(input.unlocked_step || input.unlockedStep, 1),
    completed_steps: asArray(input.completed || input.completed_steps || input.completedSteps),
    completion_percentage: asNumber(input.completion_percentage ?? input.completion, 0),
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    updated_at: new Date().toISOString()
  };

  try {
    await safeSupabase(`${PLATFORM_TABLES.visitorProgress}?on_conflict=journey_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(record)
    });
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveViewerBuild(input = {}) {
  const viewerBuildId = clean(input.viewer_build_id || input.viewerBuildId);
  const title = clean(input.title || input.idea || input.viewer_build);
  const problem = clean(input.problem || input.solve || input.viewer_problem);
  if (!title) return { configured: true, saved: false, status: "skipped", reason: "missing_title" };
  const record = {
    viewer_build_id: viewerBuildId,
    journey_id: normalizeJourneyId(input),
    email: clean(input.email).toLowerCase(),
    title,
    description: clean(input.description),
    problem,
    website: clean(input.website),
    browser_language: clean(input.browser_language || input.browserLanguage || input.language || input.lang),
    status: clean(input.status) || "submitted",
    votes: asNumber(input.votes, 0),
    comments_count: asNumber(input.comments_count || input.commentsCount, 0),
    assigned_operator: clean(input.assigned_operator || input.assignedOperator),
    public_roadmap: asBoolean(input.public_roadmap || input.publicRoadmap),
    roadmap_status: clean(input.roadmap_status || input.roadmapStatus),
    archive_reason: clean(input.archive_reason || input.archiveReason),
    created_at: clean(input.created_at || input.createdAt) || new Date().toISOString()
  };
  try {
    const path = viewerBuildId
      ? `${PLATFORM_TABLES.viewerBuilds}?on_conflict=viewer_build_id`
      : PLATFORM_TABLES.viewerBuilds;
    await safeSupabase(path, {
      method: "POST",
      headers: { Prefer: viewerBuildId ? "resolution=merge-duplicates,return=representation" : "return=representation" },
      body: JSON.stringify(record)
    });
    return { ...platformResult(true), record };
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveResourceInterest(input = {}) {
  const resource = clean(input.resource || input.title || input.category);
  if (!resource) return { configured: true, saved: false, status: "skipped", reason: "missing_resource" };
  const record = {
    journey_id: normalizeJourneyId(input),
    email: clean(input.email).toLowerCase(),
    resource,
    status: clean(input.status) || "notify_me",
    source_page: clean(input.source_page || input.sourcePage || input.page) || "resources",
    created_at: new Date().toISOString()
  };
  try {
    await safeSupabase(PLATFORM_TABLES.resourceInterest, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    });
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveFollowEvent(input = {}) {
  const record = {
    journey_id: normalizeJourneyId(input),
    source_page: clean(input.source_page || input.sourcePage || input.page) || "unknown",
    target_url: clean(input.target_url || input.targetUrl) || "https://www.tiktok.com/@doneovernight",
    clicked_at: clean(input.clicked_at || input.clickedAt) || new Date().toISOString()
  };
  try {
    await safeSupabase(PLATFORM_TABLES.followEvents, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    });
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveShareEvent(input = {}) {
  const record = {
    journey_id: normalizeJourneyId(input),
    viewer_build_id: clean(input.viewer_build_id || input.viewerBuildId),
    event_type: clean(input.event_type || input.eventType || input.type) || "share_clicked",
    page: clean(input.page) || "how-it-works",
    method: clean(input.method) || "unknown",
    url: clean(input.url) || "https://doneovernight.com/how-it-works",
    raw_payload: input.raw_payload && typeof input.raw_payload === "object" ? input.raw_payload : {},
    created_at: new Date().toISOString()
  };
  try {
    await safeSupabase(PLATFORM_TABLES.shareEvents, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    });
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function savePageEvent(input = {}) {
  const page = clean(input.page);
  if (!page) return { configured: true, saved: false, status: "skipped", reason: "missing_page" };
  const record = {
    journey_id: normalizeJourneyId(input),
    page,
    entered_at: clean(input.entered_at || input.enteredAt) || new Date().toISOString(),
    left_at: clean(input.left_at || input.leftAt) || null,
    duration: asNumber(input.duration, 0),
    referrer: clean(input.referrer),
    source: clean(input.source),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
  try {
    await safeSupabase(PLATFORM_TABLES.pageEvents, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    });
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveEmailEvent(input = {}) {
  const email = clean(input.email).toLowerCase();
  const journeyId = normalizeJourneyId(input);
  if (!email && !journeyId) return { configured: true, saved: false, status: "skipped", reason: "missing_email_or_journey" };
  const status = clean(input.status) || "pending";
  const now = new Date().toISOString();
  const record = {
    journey_id: journeyId,
    email,
    status,
    provider: clean(input.provider),
    provider_message_id: clean(input.provider_message_id || input.providerMessageId || input.message_id || input.messageId),
    sent_at: status === "sent" ? clean(input.sent_at || input.sentAt) || now : null,
    opened_at: status === "opened" ? clean(input.opened_at || input.openedAt) || now : null,
    clicked_at: status === "clicked" ? clean(input.clicked_at || input.clickedAt) || now : null,
    error: status === "failed" ? clean(input.error || input.reason) : "",
    raw_payload: input.raw_payload && typeof input.raw_payload === "object" ? input.raw_payload : {}
  };
  try {
    await safeSupabase(PLATFORM_TABLES.emailEvents, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    });
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function recordDeploymentJournalEntry() {
  const deploymentId = clean(process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL);
  const commitSha = clean(process.env.VERCEL_GIT_COMMIT_SHA);
  if (!deploymentId && !commitSha) return { configured: true, saved: false, status: "skipped", reason: "missing_deployment_metadata" };
  const record = {
    entry_type: "Deployment",
    title: "New production deployment",
    body: "Production deployed. Details are captured from Vercel metadata until the automated release journal is connected.",
    summary: "Deployment recorded automatically.",
    deployment_id: deploymentId || commitSha,
    commit_sha: commitSha,
    status: "published",
    metadata: {
      environment: clean(process.env.VERCEL_ENV),
      branch: clean(process.env.VERCEL_GIT_COMMIT_REF),
      url: clean(process.env.VERCEL_URL)
    },
    created_at: new Date().toISOString()
  };
  try {
    await safeSupabase(`${PLATFORM_TABLES.journal}?on_conflict=deployment_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(record)
    });
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function listRows(table, query = "select=*&order=created_at.desc&limit=20") {
  try {
    const rows = await safeSupabase(`${table}?${query}`);
    return { ok: true, rows: Array.isArray(rows) ? rows : [], placeholder: false };
  } catch (error) {
    return { ok: false, rows: [], placeholder: true, reason: platformUnavailable(error).reason };
  }
}

async function getPlatformSnapshot() {
  await recordDeploymentJournalEntry().catch(() => null);
  const [
    journeys,
    viewerBuilds,
    resources,
    journal,
    liveStatus,
    emailEvents,
    pageEvents
  ] = await Promise.all([
    listRows(PLATFORM_TABLES.journeys, "select=*&order=started_at.desc&limit=80"),
    listRows(PLATFORM_TABLES.viewerBuilds, "select=*&order=created_at.desc&limit=40"),
    listRows(PLATFORM_TABLES.resourceInterest, "select=*&order=created_at.desc&limit=40"),
    listRows(PLATFORM_TABLES.journal, "select=*&order=created_at.desc&limit=20"),
    listRows(PLATFORM_TABLES.liveStatus, "select=*&order=updated_at.desc&limit=1"),
    listRows(PLATFORM_TABLES.emailEvents, "select=*&order=created_at.desc&limit=80"),
    listRows(PLATFORM_TABLES.pageEvents, "select=*&order=entered_at.desc&limit=80")
  ]);

  return {
    generated_at: new Date().toISOString(),
    placeholder: [journeys, viewerBuilds, resources, journal, liveStatus, emailEvents, pageEvents].some((item) => item.placeholder),
    journeys,
    viewer_builds: viewerBuilds,
    resource_interest: resources,
    journal,
    live_status: liveStatus,
    email_events: emailEvents,
    page_events: pageEvents
  };
}

module.exports = {
  PLATFORM_TABLES,
  asArray,
  asNumber,
  normalizeJourneyId,
  upsertJourney,
  saveVisitorProgress,
  saveViewerBuild,
  saveResourceInterest,
  saveFollowEvent,
  saveShareEvent,
  savePageEvent,
  saveEmailEvent,
  recordDeploymentJournalEntry,
  getPlatformSnapshot
};
