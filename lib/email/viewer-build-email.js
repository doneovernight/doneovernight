const { buildClientEmail, clean } = require("./client-template");
const { getWebhookUrls } = require("../ops");
const { resolvePlatformLanguage } = require("../language");

const WEBHOOK_TIMEOUT_MS = 10_000;
const BASE_URL = "https://doneovernight.com";
const TIKTOK_URL = "https://www.tiktok.com/@doneovernight";

function getViewerBuildWebhookUrls() {
  return getWebhookUrls([
    "VIEWER_BUILD_EMAIL_WEBHOOK_URL",
    "VIEWER_BUILD_WEBHOOK_URL",
    "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL"
  ]);
}

function getViewerBuildConfirmationWebhookUrl() {
  return getWebhookUrls([
    "VIEWER_BUILD_EMAIL_WEBHOOK_URL",
    "VIEWER_BUILD_WEBHOOK_URL"
  ])[0] || "";
}

function getViewerBuildInternalWebhookUrls() {
  return getWebhookUrls([
    "VIEWER_BUILD_INTERNAL_WEBHOOK_URL",
    "VIEWER_BUILD_NOTIFY_WEBHOOK_URL"
  ]);
}

function normalizeEmail(value = "") {
  return clean(value).toLowerCase();
}

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function buildViewerBuildConfirmationEmail(input = {}) {
  const language = resolvePlatformLanguage(input);
  const isDutch = language.email_language === "nl";
  const viewerBuildId = clean(input.viewer_build_id || input.viewerBuildId);
  const journeyId = clean(input.journey_id || input.journeyId);
  const idea = clean(input.idea || input.title);
  const description = clean(input.description);
  const problem = clean(input.problem || input.solve);
  const website = clean(input.website);
  const status = clean(input.status) || "submitted";
  const createdAt = clean(input.created_at || input.createdAt) || new Date().toISOString();
  const labels = isDutch ? {
    subject: "Viewer Build ontvangen.",
    preheader: `Viewer Build ontvangen. Referentie: ${viewerBuildId}`,
    statusLabel: "VIEWER BUILD ONTVANGEN",
    title: "Je build idee staat erin.",
    intro: "Bedankt voor je bijdrage aan DONEOVERNIGHT.",
    lead: "Je idee is toegevoegd aan onze build queue.",
    bullets: [
      "Elke Viewer Build wordt bekeken.",
      "Sommige ideeën worden publieke builds.",
      "Sommige worden client systems.",
      "Sommige worden toekomstige producten."
    ],
    selected: "Als jouw idee wordt geselecteerd, hoor je het als eerste.",
    continue: "Ga verder met je journey",
    live: "Bekijk Live Builds",
    resources: "Open Resources",
    journal: "Bekijk Build Journal",
    follow: "Volg de journey",
    viewerBuildId: "Viewer Build ID",
    journeyId: "Journey ID",
    idea: "Idee",
    description: "Beschrijving",
    problem: "Probleem",
    website: "Website",
    submitted: "Ingestuurd op",
    status: "Status",
    language: "Selected language"
  } : {
    subject: "Viewer Build received.",
    preheader: `Viewer Build received. Reference: ${viewerBuildId}`,
    statusLabel: "VIEWER BUILD RECEIVED",
    title: "Your build idea is in.",
    intro: "Thanks for contributing to DONEOVERNIGHT.",
    lead: "Your idea has been added to our build queue.",
    bullets: [
      "Every Viewer Build is reviewed.",
      "Some become public builds.",
      "Some become client systems.",
      "Some become future products."
    ],
    selected: "If your idea is selected, you'll be one of the first to know.",
    continue: "Continue your journey",
    live: "View Live Builds",
    resources: "Resources",
    journal: "Build Journal",
    follow: "Follow the Journey",
    viewerBuildId: "Viewer Build ID",
    journeyId: "Journey ID",
    idea: "Idea",
    description: "Description",
    problem: "Problem",
    website: "Website",
    submitted: "Submitted at",
    status: "Status",
    language: "Selected language"
  };
  const rendered = buildClientEmail({
    subject: clean(input.subject) || labels.subject,
    preheader: labels.preheader,
    statusLabel: labels.statusLabel,
    title: labels.title,
    intro: labels.intro,
    lead: labels.lead,
    bullets: labels.bullets,
    rows: [
      [labels.viewerBuildId, viewerBuildId],
      journeyId ? [labels.journeyId, journeyId] : null,
      idea ? [labels.idea, idea] : null,
      description ? [labels.description, description] : null,
      problem ? [labels.problem, problem] : null,
      website ? [labels.website, website] : null,
      [labels.submitted, createdAt],
      [labels.status, status],
      [labels.language, language.email_language.toUpperCase()]
    ],
    body: [
      labels.selected,
      `${labels.continue}: ${BASE_URL}/how-it-works`,
      `${labels.live}: ${BASE_URL}/live`,
      `${labels.resources}: ${BASE_URL}/resources`,
      `${labels.journal}: ${BASE_URL}/journal`,
      `${labels.follow}: ${TIKTOK_URL}`
    ],
    taskLabel: "Viewer Build",
    taskDescription: idea || viewerBuildId,
    ctaLabel: labels.continue,
    ctaUrl: `${BASE_URL}/how-it-works`,
    secondaryCtaLabel: labels.live,
    secondaryCtaUrl: `${BASE_URL}/live`,
    footerMeta: `Viewer Build ID: ${viewerBuildId}`,
    replyTo: "ask@doneovernight.com"
  });

  return {
    to: normalizeEmail(input.email),
    subject: clean(input.subject) || labels.subject,
    viewerBuildId,
    journeyId,
    idea,
    description,
    problem,
    website,
    status,
    createdAt,
    text: rendered.text,
    html: rendered.html,
    continueUrl: `${BASE_URL}/how-it-works`,
    liveUrl: `${BASE_URL}/live`,
    resourcesUrl: `${BASE_URL}/resources`,
    journalUrl: `${BASE_URL}/journal`,
    tiktokUrl: TIKTOK_URL,
    language
  };
}

async function postWebhook(url, payload = {}, timeoutMs = WEBHOOK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text().catch(() => "");
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      json = null;
    }
    if (!response.ok) {
      const error = new Error(`Viewer build webhook failed: ${response.status}`);
      error.statusCode = response.status;
      error.responseText = text.slice(0, 500);
      throw error;
    }
    if (json?.success === false || json?.delivered === false || json?.email_sent === false) {
      throw new Error("Viewer build webhook did not confirm processing");
    }
    return {
      status: response.status,
      provider: json?.provider || "n8n_outlook",
      response: json
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViewerBuildInternalNotification(input = {}, options = {}) {
  const urls = getViewerBuildInternalWebhookUrls();
  const language = resolvePlatformLanguage(input);
  const payload = {
    event: "viewer_build_internal_notification",
    event_type: "viewer_build_internal_notification",
    type: "viewer_build",
    workflow_version: "viewer_build_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    viewer_build_id: clean(input.viewer_build_id || input.viewerBuildId),
    journey_id: clean(input.journey_id || input.journeyId),
    idea: clean(input.idea || input.title),
    title: clean(input.idea || input.title),
    description: clean(input.description),
    problem: clean(input.problem || input.solve),
    website: clean(input.website),
    email: normalizeEmail(input.email),
    source: clean(input.source) || "viewer_builds",
    language: language.email_language,
    selected_language: language.selected_language,
    browser_language: language.browser_language,
    detected_content_language: language.detected_content_language,
    email_language: language.email_language,
    created_at: clean(input.created_at || input.createdAt) || new Date().toISOString(),
    status: clean(input.status) || "submitted"
  };

  const results = await Promise.allSettled(urls.map((url) => postWebhook(url, payload, options.timeoutMs)));
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  return {
    configured: urls.length > 0,
    sent: fulfilled.length > 0,
    delivered: fulfilled.length > 0,
    provider: fulfilled[0]?.value?.provider || (urls.length ? "webhook" : "none"),
    reason: fulfilled.length ? "sent" : (urls.length ? "failed" : "not_configured"),
    attempted: urls.length
  };
}

async function sendViewerBuildConfirmationEmail(input = {}, options = {}) {
  const email = buildViewerBuildConfirmationEmail(input);
  if (!email.to) {
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: "missing_email",
      provider: "none",
      email
    };
  }
  if (!isValidEmail(email.to)) {
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: "invalid_email",
      provider: "none",
      email
    };
  }
  if (!clean(email.subject) || !clean(email.text) || !clean(email.html)) {
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: "empty_email_payload",
      provider: "none",
      email
    };
  }

  const url = getViewerBuildConfirmationWebhookUrl();
  const urls = url ? [url] : [];
  const payload = {
    event: "viewer_build_confirmation_email",
    event_type: "viewer_build_confirmation_email",
    type: "viewer_build_confirmation",
    workflow_version: "viewer_build_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: email.to,
    email: email.to,
    client_email: email.to,
    subject: email.subject,
    viewer_build_id: email.viewerBuildId,
    journey_id: email.journeyId,
    idea: email.idea,
    description: email.description,
    problem: email.problem,
    website: email.website,
    status: email.status,
    created_at: email.createdAt,
    language: email.language.email_language,
    lang: email.language.email_language,
    selected_language: email.language.selected_language,
    browser_language: email.language.browser_language,
    detected_content_language: email.language.detected_content_language,
    email_language: email.language.email_language,
    continue_url: email.continueUrl,
    live_url: email.liveUrl,
    resources_url: email.resourcesUrl,
    journal_url: email.journalUrl,
    tiktok_url: email.tiktokUrl,
    text: email.text,
    html: email.html
  };
  const results = await Promise.allSettled(urls.map((url) => postWebhook(url, payload, options.timeoutMs)));
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  return {
    configured: urls.length > 0,
    sent: fulfilled.length > 0,
    delivered: fulfilled.length > 0,
    provider: fulfilled[0]?.value?.provider || (urls.length ? "webhook" : "none"),
    reason: fulfilled.length ? "sent" : (urls.length ? "failed" : "not_configured"),
    attempted: urls.length,
    email
  };
}

module.exports = {
  buildViewerBuildConfirmationEmail,
  isValidEmail,
  sendViewerBuildConfirmationEmail,
  sendViewerBuildInternalNotification
};
