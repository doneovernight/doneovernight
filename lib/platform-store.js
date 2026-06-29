const { clean, supabaseFetch } = require("./ops");
const { resolvePlatformLanguage } = require("./language");

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

function asList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value)
    .split(/\n|,/)
    .map(clean)
    .filter(Boolean);
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

function missingColumnName(error = {}) {
  const detail = String(error.detail || error.message || "");
  const patterns = [
    /'([^']+)'\s+column/i,
    /column\s+"?([a-zA-Z0-9_]+)"?/i,
    /Could not find the '([^']+)' column/i
  ];
  for (const pattern of patterns) {
    const match = detail.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function safeWrite(path, options = {}, optionalColumns = []) {
  let body = {};
  try {
    body = typeof options.body === "string" ? JSON.parse(options.body) : { ...(options.body || {}) };
  } catch (error) {
    return safeSupabase(path, options);
  }
  const optional = new Set(optionalColumns);
  for (let attempt = 0; attempt < optionalColumns.length + 1; attempt += 1) {
    try {
      return await safeSupabase(path, {
        ...options,
        body: JSON.stringify(body)
      });
    } catch (error) {
      const missingColumn = missingColumnName(error);
      if (!missingColumn || !optional.has(missingColumn) || !Object.prototype.hasOwnProperty.call(body, missingColumn)) throw error;
      if (Object.prototype.hasOwnProperty.call(body, "raw_payload")) {
        body.raw_payload = {
          ...(body.raw_payload && typeof body.raw_payload === "object" ? body.raw_payload : {}),
          [missingColumn]: body[missingColumn],
          language_columns_skipped: [
            ...new Set([...(body.raw_payload?.language_columns_skipped || []), missingColumn])
          ]
        };
      }
      delete body[missingColumn];
    }
  }
  return safeSupabase(path, { ...options, body: JSON.stringify(body) });
}

function languageFields(input = {}) {
  return resolvePlatformLanguage(input);
}

function languageRawPayload(input = {}) {
  const fields = languageFields(input);
  return {
    selected_language: fields.selected_language,
    browser_language: fields.browser_language,
    detected_content_language: fields.detected_content_language,
    email_language: fields.email_language
  };
}

const LANGUAGE_COLUMNS = ["selected_language", "browser_language", "detected_content_language", "email_language"];

async function upsertJourney(input = {}, context = {}) {
  const journeyId = normalizeJourneyId(input);
  if (!journeyId) return { configured: true, saved: false, status: "skipped", reason: "missing_journey_id" };
  const utm = parseUtm(input);
  const now = new Date().toISOString();
  const language = languageFields({
    ...input,
    browser_language: input.browser_language || input.browserLanguage || context.browserLanguage
  });
  const record = omitEmpty({
    journey_id: journeyId,
    email: clean(input.email).toLowerCase(),
    social_handle: clean(input.social_handle || input.socialHandle),
    source: clean(input.source) || "unknown",
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    selected_language: language.selected_language,
    browser_language: language.browser_language,
    detected_content_language: language.detected_content_language,
    email_language: language.email_language,
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
    await safeWrite(`${PLATFORM_TABLES.journeys}?on_conflict=journey_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(record)
    }, LANGUAGE_COLUMNS);
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveVisitorProgress(input = {}) {
  const journeyId = normalizeJourneyId(input);
  if (!journeyId) return { configured: true, saved: false, status: "skipped", reason: "missing_journey_id" };
  const language = languageFields(input);
  const record = {
    journey_id: journeyId,
    selected_language: language.selected_language,
    browser_language: language.browser_language,
    detected_content_language: language.detected_content_language,
    email_language: language.email_language,
    active_step: asNumber(input.active_step || input.activeStep, 1),
    unlocked_step: asNumber(input.unlocked_step || input.unlockedStep, 1),
    completed_steps: asArray(input.completed || input.completed_steps || input.completedSteps),
    completion_percentage: asNumber(input.completion_percentage ?? input.completion, 0),
    payload: {
      ...(input.payload && typeof input.payload === "object" ? input.payload : {}),
      language: languageRawPayload(input)
    },
    updated_at: new Date().toISOString()
  };

  try {
    await safeWrite(`${PLATFORM_TABLES.visitorProgress}?on_conflict=journey_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(record)
    }, LANGUAGE_COLUMNS);
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
  const language = languageFields(input);
  const record = {
    viewer_build_id: viewerBuildId,
    journey_id: normalizeJourneyId(input),
    email: clean(input.email).toLowerCase(),
    title,
    description: clean(input.description),
    problem,
    website: clean(input.website),
    selected_language: language.selected_language,
    browser_language: language.browser_language,
    detected_content_language: language.detected_content_language,
    email_language: language.email_language,
    status: clean(input.status) || "submitted",
    votes: asNumber(input.votes, 0),
    comments_count: asNumber(input.comments_count || input.commentsCount, 0),
    assigned_operator: clean(input.assigned_operator || input.assignedOperator),
    public_roadmap: asBoolean(input.public_roadmap || input.publicRoadmap),
    roadmap_status: clean(input.roadmap_status || input.roadmapStatus),
    archive_reason: clean(input.archive_reason || input.archiveReason),
    raw_payload: {
      ...(input.raw_payload && typeof input.raw_payload === "object" ? input.raw_payload : {}),
      language: languageRawPayload(input)
    },
    created_at: clean(input.created_at || input.createdAt) || new Date().toISOString()
  };
  try {
    const path = viewerBuildId
      ? `${PLATFORM_TABLES.viewerBuilds}?on_conflict=viewer_build_id`
      : PLATFORM_TABLES.viewerBuilds;
    await safeWrite(path, {
      method: "POST",
      headers: { Prefer: viewerBuildId ? "resolution=merge-duplicates,return=representation" : "return=representation" },
      body: JSON.stringify(record)
    }, LANGUAGE_COLUMNS);
    return { ...platformResult(true), record };
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveResourceInterest(input = {}) {
  const resource = clean(input.resource || input.title || input.category);
  if (!resource) return { configured: true, saved: false, status: "skipped", reason: "missing_resource" };
  const language = languageFields(input);
  const record = {
    journey_id: normalizeJourneyId(input),
    email: clean(input.email).toLowerCase(),
    resource,
    selected_language: language.selected_language,
    browser_language: language.browser_language,
    detected_content_language: language.detected_content_language,
    email_language: language.email_language,
    status: clean(input.status) || "notify_me",
    source_page: clean(input.source_page || input.sourcePage || input.page) || "resources",
    created_at: new Date().toISOString()
  };
  try {
    await safeWrite(PLATFORM_TABLES.resourceInterest, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    }, LANGUAGE_COLUMNS);
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveFollowEvent(input = {}) {
  const language = languageFields(input);
  const record = {
    journey_id: normalizeJourneyId(input),
    selected_language: language.selected_language,
    browser_language: language.browser_language,
    detected_content_language: language.detected_content_language,
    email_language: language.email_language,
    source_page: clean(input.source_page || input.sourcePage || input.page) || "unknown",
    target_url: clean(input.target_url || input.targetUrl) || "https://www.tiktok.com/@doneovernight",
    clicked_at: clean(input.clicked_at || input.clickedAt) || new Date().toISOString()
  };
  try {
    await safeWrite(PLATFORM_TABLES.followEvents, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    }, LANGUAGE_COLUMNS);
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveShareEvent(input = {}) {
  const language = languageFields(input);
  const record = {
    journey_id: normalizeJourneyId(input),
    viewer_build_id: clean(input.viewer_build_id || input.viewerBuildId),
    selected_language: language.selected_language,
    browser_language: language.browser_language,
    detected_content_language: language.detected_content_language,
    email_language: language.email_language,
    event_type: clean(input.event_type || input.eventType || input.type) || "share_clicked",
    page: clean(input.page) || "how-it-works",
    method: clean(input.method) || "unknown",
    url: clean(input.url) || "https://doneovernight.com/how-it-works",
    raw_payload: {
      ...(input.raw_payload && typeof input.raw_payload === "object" ? input.raw_payload : {}),
      language: languageRawPayload(input)
    },
    created_at: new Date().toISOString()
  };
  try {
    await safeWrite(PLATFORM_TABLES.shareEvents, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    }, LANGUAGE_COLUMNS);
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function savePageEvent(input = {}) {
  const page = clean(input.page);
  if (!page) return { configured: true, saved: false, status: "skipped", reason: "missing_page" };
  const language = languageFields(input);
  const record = {
    journey_id: normalizeJourneyId(input),
    page,
    selected_language: language.selected_language,
    browser_language: language.browser_language,
    detected_content_language: language.detected_content_language,
    email_language: language.email_language,
    entered_at: clean(input.entered_at || input.enteredAt) || new Date().toISOString(),
    left_at: clean(input.left_at || input.leftAt) || null,
    duration: asNumber(input.duration, 0),
    referrer: clean(input.referrer),
    source: clean(input.source),
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      language: languageRawPayload(input)
    }
  };
  try {
    await safeWrite(PLATFORM_TABLES.pageEvents, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    }, LANGUAGE_COLUMNS);
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
  const language = languageFields(input);
  const record = {
    journey_id: journeyId,
    email,
    selected_language: language.selected_language,
    browser_language: language.browser_language,
    detected_content_language: language.detected_content_language,
    email_language: language.email_language,
    status,
    provider: clean(input.provider),
    provider_message_id: clean(input.provider_message_id || input.providerMessageId || input.message_id || input.messageId),
    sent_at: status === "sent" ? clean(input.sent_at || input.sentAt) || now : null,
    opened_at: status === "opened" ? clean(input.opened_at || input.openedAt) || now : null,
    clicked_at: status === "clicked" ? clean(input.clicked_at || input.clickedAt) || now : null,
    error: status === "failed" ? clean(input.error || input.reason) : "",
    raw_payload: {
      ...(input.raw_payload && typeof input.raw_payload === "object" ? input.raw_payload : {}),
      language: languageRawPayload(input)
    }
  };
  try {
    await safeWrite(PLATFORM_TABLES.emailEvents, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(record)
    }, LANGUAGE_COLUMNS);
    return platformResult(true);
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function saveLiveStatus(input = {}) {
  const action = clean(input.action || input.intent || input.event);
  if (action === "clear_live_status") return clearLiveStatus();
  const existing = action === "send_heartbeat" || input.merge_existing === true
    ? await latestLiveStatus()
    : {};
  const source = { ...existing, ...input };
  const progressValue = input.progress_percentage ?? input.progressPercent ?? input.progress;
  const progressNumber = Number(progressValue);
  const progressText = clean(source.current_progress || source.currentProgress || source.progress);
  const record = {
    current_build: clean(source.current_build || source.currentBuild),
    current_operator: clean(source.current_operator || source.currentOperator),
    current_client: clean(source.current_project || source.currentProject || source.current_client || source.currentClient),
    current_repository: clean(source.current_repository || source.currentRepository || source.repository),
    current_branch: clean(source.current_branch || source.currentBranch),
    current_commit: clean(source.current_commit || source.currentCommit),
    latest_deployment: clean(source.latest_deployment || source.latestDeployment),
    heartbeat: action === "send_heartbeat"
      ? clean(input.heartbeat) || new Date().toISOString()
      : clean(source.heartbeat),
    estimated_completion: clean(source.estimated_completion || source.estimatedCompletion),
    current_focus: clean(source.current_focus || source.currentFocus),
    current_progress: progressText,
    progress_percentage: Number.isFinite(progressNumber)
      ? Math.max(0, Math.min(100, Math.round(progressNumber)))
      : asNumber(source.progress_percentage || source.progressPercentage, 0),
    repository_status: clean(source.repository_status || source.repositoryStatus),
    recent_activity: asList(source.recent_activity || source.recentActivity),
    latest_wins: asList(source.latest_wins || source.latestWins),
    recently_finished: asList(source.recently_finished || source.recentlyFinished),
    upcoming_builds: asList(source.upcoming_builds || source.upcomingBuilds),
    placeholder: false,
    updated_at: clean(input.last_update || input.lastUpdate || input.updated_at || input.updatedAt) || new Date().toISOString()
  };

  try {
    const rows = await safeSupabase(PLATFORM_TABLES.liveStatus, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(record)
    });
    return { ...platformResult(true), record: Array.isArray(rows) ? rows[0] : record };
  } catch (error) {
    return platformUnavailable(error);
  }
}

async function latestLiveStatus() {
  try {
    const rows = await safeSupabase(`${PLATFORM_TABLES.liveStatus}?select=*&order=updated_at.desc&limit=1`);
    return Array.isArray(rows) && rows[0] ? rows[0] : {};
  } catch (error) {
    return {};
  }
}

async function clearLiveStatus() {
  const record = {
    current_build: "",
    current_operator: "",
    current_client: "",
    current_repository: "",
    current_branch: "",
    current_commit: "",
    latest_deployment: "",
    heartbeat: "",
    estimated_completion: "",
    current_focus: "",
    current_progress: "",
    progress_percentage: 0,
    repository_status: "",
    recent_activity: [],
    latest_wins: [],
    recently_finished: [],
    upcoming_builds: [],
    placeholder: true,
    updated_at: new Date().toISOString()
  };
  try {
    const rows = await safeSupabase(PLATFORM_TABLES.liveStatus, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(record)
    });
    return { ...platformResult(true), record: Array.isArray(rows) ? rows[0] : record };
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

async function syncDeploymentLiveStatus() {
  if (clean(process.env.VERCEL_ENV) !== "production") {
    return { configured: true, saved: false, status: "skipped", reason: "not_production" };
  }
  const deploymentId = clean(process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL);
  const deploymentUrl = clean(process.env.VERCEL_URL);
  const commitSha = clean(process.env.VERCEL_GIT_COMMIT_SHA);
  if (!deploymentId && !commitSha) {
    return { configured: true, saved: false, status: "skipped", reason: "missing_deployment_metadata" };
  }

  const deploymentLabel = deploymentUrl ? `https://${deploymentUrl}` : deploymentId;
  const existing = await latestLiveStatus();
  if (
    (deploymentLabel && clean(existing.latest_deployment) === deploymentLabel) ||
    (commitSha && clean(existing.current_commit) === commitSha)
  ) {
    return { configured: true, saved: false, status: "skipped", reason: "deployment_already_synced" };
  }

  const commitMessage = clean(process.env.VERCEL_GIT_COMMIT_MESSAGE);
  const commitLabel = commitSha ? commitSha.slice(0, 7) : "";
  const branch = clean(process.env.VERCEL_GIT_COMMIT_REF);
  const repoOwner = clean(process.env.VERCEL_GIT_REPO_OWNER);
  const repoSlug = clean(process.env.VERCEL_GIT_REPO_SLUG);
  const repository = repoOwner && repoSlug ? `${repoOwner}/${repoSlug}` : repoSlug;
  const summary = commitMessage || (commitLabel ? `Commit ${commitLabel}` : "Production deployment");
  const now = new Date().toISOString();
  const token = clean(process.env.HQ_ACCESS_TOKEN);
  if (!token) {
    return { configured: false, saved: false, status: "not_configured", reason: "hq_access_token_missing" };
  }
  const endpoint = clean(process.env.LIVE_STATUS_ENDPOINT) || "https://doneovernight.com/api/live-status";
  const payload = {
    current_build: summary,
    current_project: "DONEOVERNIGHT Platform",
    current_repository: repository,
    latest_deployment: deploymentLabel,
    current_branch: branch,
    current_commit: commitSha,
    heartbeat: `Production deployment recorded ${now}`,
    repository_status: "Production deployment connected",
    last_update: now,
    current_focus: summary,
    progress_percentage: 100,
    current_progress: "Production deployment live",
    recent_activity: [
      deploymentLabel ? `Deployment: ${deploymentLabel}` : "",
      commitLabel ? `Commit: ${commitLabel}` : "",
      branch ? `Branch: ${branch}` : ""
    ].filter(Boolean),
    latest_wins: [
      commitMessage,
      deploymentId ? `Deployment ID: ${deploymentId}` : ""
    ].filter(Boolean)
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-hq-access-token": token
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    return result.saved === true
      ? { ...platformResult(true), record: result.live_status || null }
      : { configured: true, saved: false, status: "failed", reason: result.reason || result.error || `http_${response.status}` };
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
  await syncDeploymentLiveStatus().catch(() => null);
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
  saveLiveStatus,
  recordDeploymentJournalEntry,
  syncDeploymentLiveStatus,
  getPlatformSnapshot
};
