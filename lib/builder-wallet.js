const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://doneovernight.com";
const CONNECT_URL = `${BASE_URL}/connect`;
const BUILDER_BASE_URL = `${BASE_URL}/builder`;
const TIKTOK_URL = "https://www.tiktok.com/@doneovernight";
const INSTAGRAM_URL = "https://www.instagram.com/doneovernight";
const LINKEDIN_URL = "https://www.linkedin.com/company/doneovernight";
const LOGO_URL = `${BASE_URL}/brand/doneovernight-white.png`;
const LOGO_NEUTRAL_URL = `${BASE_URL}/brand/doneovernight-neutral.png`;
const DEFAULT_PASS_TYPE = "pass.com.doneovernight.builder";
const FOUNDER_PASS_TYPE = "pass.com.doneovernight.founder";

function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const item = clean(value);
  return item ? [item] : [];
}

function serialSafe(value = "") {
  return clean(value).replace(/[^a-zA-Z0-9._-]/g, "-") || crypto.randomUUID();
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function sha1File(relativePath, fallback = "") {
  try {
    const absolute = path.join(process.cwd(), relativePath);
    return crypto.createHash("sha1").update(fs.readFileSync(absolute)).digest("hex");
  } catch (error) {
    return sha1(fallback || relativePath);
  }
}

function normalizeBuilderNumber(value = "") {
  const raw = clean(value).replace(/^#|builder\s*#/i, "");
  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric) && numeric > 0) return String(numeric);
  return raw;
}

function formatBuilderNumber(value = "") {
  const normalized = normalizeBuilderNumber(value);
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric) && numeric > 0) return `#${numeric}`;
  return normalized ? `#${normalized}` : "Pending";
}

function builderIdentityLine(input = {}, locale = "en") {
  const language = clean(locale || input.selected_language || input.email_language || input.lang || input.language).toLowerCase().startsWith("nl") ? "nl" : "en";
  const source = [
    input.builder_type,
    input.builderType,
    input.path,
    input.chosen_path,
    input.chosenPath,
    ...asArray(input.interests || input.chosen_interests || input.chosenInterests)
  ].join(" ").toLowerCase();
  const lines = {
    en: [
      [/operator/, "You move ideas into execution."],
      [/architect|architecture/, "You think long before you build."],
      [/automation|automatisering/, "You remove repetition before it becomes expensive."],
      [/business/, "You turn momentum into structure."],
      [/\bai\b|intelligence/, "You multiply execution with intelligence."],
      [/design|experience|taste/, "You make systems feel human."],
      [/system|systems|systemen|infrastructure/, "You create leverage."]
    ],
    nl: [
      [/operator/, "Je brengt ideeën naar uitvoering."],
      [/architect|architecture|architectuur/, "Je denkt lang voordat je bouwt."],
      [/automation|automatisering/, "Je haalt herhaling weg voordat het duur wordt."],
      [/business/, "Je zet momentum om in structuur."],
      [/\bai\b|intelligence/, "Je vermenigvuldigt uitvoering met intelligentie."],
      [/design|experience|taste/, "Je maakt systemen menselijk."],
      [/system|systems|systemen|infrastructure/, "Je creëert hefboom."]
    ]
  };
  const match = lines[language].find(([pattern]) => pattern.test(source));
  if (match) return match[1];
  return language === "nl" ? "Je bouwt voordat de wereld bij is." : "You build before the world catches up.";
}

function founderIdentity() {
  return {
    passKind: "founder",
    organization: "DONEOVERNIGHT",
    title: "Founder",
    name: "Donovan van der Poel",
    role: "Founder & Operator",
    founderId: "DON-000001",
    website: "doneovernight.com",
    email: "ask@doneovernight.com",
    motto: "While you sleep, we execute.",
    qrUrl: CONNECT_URL,
    links: {
      instagram: INSTAGRAM_URL,
      tiktok: TIKTOK_URL,
      linkedin: LINKEDIN_URL,
      email: "mailto:ask@doneovernight.com",
      website: BASE_URL,
      ask: "https://ask.doneovernight.com",
      connect: CONNECT_URL,
      howItWorks: `${BASE_URL}/how-it-works`,
      live: `${BASE_URL}/live`,
      resources: `${BASE_URL}/resources`,
      journal: `${BASE_URL}/journal`,
      products: `${BASE_URL}/products`,
      hq: `${BASE_URL}/hq`
    }
  };
}

function builderIdentity(input = {}) {
  const builderNumber = normalizeBuilderNumber(input.builder_number || input.builderNumber);
  const journeyId = clean(input.journey_id || input.journeyId);
  const fallbackProfileUrl = `${BASE_URL}/how-it-works?journey=${encodeURIComponent(journeyId || builderNumber || "builder")}`;
  const builderProfileUrl = builderNumber ? `${BUILDER_BASE_URL}/${encodeURIComponent(builderNumber)}` : fallbackProfileUrl;
  const locale = clean(input.selected_language || input.email_language || input.lang || input.language);
  return {
    passKind: "builder",
    journeyId,
    builderNumber,
    builderType: clean(input.builder_type || input.builderType) || "Builder",
    status: clean(input.status) || "Founding Builder",
    joinedAt: clean(input.joined_at || input.joinedAt) || new Date().toISOString(),
    completion: Math.max(0, Math.min(100, Number(input.completion || input.completion_percentage || 0))),
    path: clean(input.path || input.chosen_path || input.chosenPath),
    interests: asArray(input.interests || input.chosen_interests || input.chosenInterests),
    automationChoice: asArray(input.automation_choice || input.automationChoice),
    currentStage: clean(input.current_stage || input.currentStage),
    identityLine: clean(input.identity_line || input.identityLine) || builderIdentityLine(input, locale),
    qrUrl: clean(input.profile_url || input.profileUrl) || builderProfileUrl
  };
}

function passAssets(kind = "builder") {
  return {
    logo: {
      source: LOGO_URL,
      role: "logo.png",
      sha1: sha1File("brand/doneovernight-white.png", LOGO_URL)
    },
    "logo@2x": {
      source: LOGO_URL,
      role: "logo@2x.png",
      sha1: sha1File("brand/doneovernight-white.png", LOGO_URL)
    },
    icon: {
      source: LOGO_NEUTRAL_URL,
      role: "icon.png",
      sha1: sha1File("brand/doneovernight-neutral.png", LOGO_NEUTRAL_URL)
    },
    "icon@2x": {
      source: LOGO_NEUTRAL_URL,
      role: "icon@2x.png",
      sha1: sha1File("brand/doneovernight-neutral.png", LOGO_NEUTRAL_URL)
    },
    metadata: {
      source: `${BASE_URL}/brand/doneovernight-white.png`,
      identity: kind
    }
  };
}

function founderApplePassJson(input = {}) {
  const identity = founderIdentity(input);
  return {
    formatVersion: 1,
    passTypeIdentifier: clean(process.env.APPLE_WALLET_FOUNDER_PASS_TYPE_IDENTIFIER) || clean(process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER) || FOUNDER_PASS_TYPE,
    serialNumber: identity.founderId,
    teamIdentifier: clean(process.env.APPLE_WALLET_TEAM_IDENTIFIER) || "",
    organizationName: identity.organization,
    description: "DONEOVERNIGHT Founder Pass",
    logoText: "",
    foregroundColor: "rgb(245,241,232)",
    backgroundColor: "rgb(5,6,8)",
    labelColor: "rgb(233,196,138)",
    sharingProhibited: false,
    userInfo: {
      nfc_ready: true,
      nfc_status: "future_support"
    },
    barcodes: [
      {
        message: identity.qrUrl,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
        altText: "Open DONEOVERNIGHT"
      }
    ],
    generic: {
      primaryFields: [
        { key: "founder", label: identity.title, value: identity.name }
      ],
      secondaryFields: [
        { key: "founder_id", label: "Founder ID", value: identity.founderId },
        { key: "motto", label: identity.organization, value: identity.motto }
      ],
      auxiliaryFields: [],
      backFields: [
        { key: "website", label: "Website", value: identity.links.website },
        { key: "how_it_works", label: "How It Works", value: identity.links.howItWorks },
        { key: "live", label: "Live", value: identity.links.live },
        { key: "resources", label: "Resources", value: identity.links.resources },
        { key: "products", label: "Products", value: identity.links.products },
        { key: "journal", label: "Journal", value: identity.links.journal },
        { key: "ask", label: "Ask", value: identity.links.ask },
        { key: "email", label: "Email", value: identity.links.email },
        { key: "instagram", label: "Instagram", value: identity.links.instagram },
        { key: "tiktok", label: "TikTok", value: identity.links.tiktok },
        { key: "linkedin", label: "LinkedIn", value: identity.links.linkedin },
        { key: "hq", label: "HQ", value: identity.links.hq },
        { key: "founder_id", label: "Founder ID", value: identity.founderId }
      ]
    }
  };
}

function builderApplePassJson(input = {}) {
  const identity = builderIdentity(input);
  const builderNumber = formatBuilderNumber(identity.builderNumber);
  return {
    formatVersion: 1,
    passTypeIdentifier: clean(process.env.APPLE_WALLET_BUILDER_PASS_TYPE_IDENTIFIER) || clean(process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER) || DEFAULT_PASS_TYPE,
    serialNumber: serialSafe(identity.journeyId || `builder-${identity.builderNumber}`),
    teamIdentifier: clean(process.env.APPLE_WALLET_TEAM_IDENTIFIER) || "",
    organizationName: "DONEOVERNIGHT",
    description: "DONEOVERNIGHT Builder Pass",
    logoText: "",
    foregroundColor: "rgb(245,241,232)",
    backgroundColor: "rgb(5,6,8)",
    labelColor: "rgb(233,196,138)",
    barcodes: [
      {
        message: identity.qrUrl,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
        altText: "Open Builder Profile"
      }
    ],
    generic: {
      primaryFields: [
        { key: "builder", label: "DONEOVERNIGHT", value: `Builder ${builderNumber}` }
      ],
      secondaryFields: [
        { key: "type", label: "Builder Type", value: identity.builderType },
        { key: "status", label: "Current Status", value: identity.status }
      ],
      auxiliaryFields: [
        { key: "journey", label: "Journey ID", value: identity.journeyId }
      ],
      backFields: [
        { key: "completion", label: "Completion", value: `${identity.completion}%` },
        { key: "joined", label: "Joined", value: identity.joinedAt.slice(0, 10) },
        { key: "interests", label: "Primary Interests", value: identity.interests.join(", ") },
        { key: "path", label: "Path", value: identity.path },
        { key: "automation", label: "Automation Choice", value: identity.automationChoice.join(", ") },
        { key: "identity", label: "Identity Line", value: identity.identityLine },
        { key: "profile", label: "Builder Profile", value: identity.qrUrl }
      ].filter((field) => field.value)
    }
  };
}

function applePassJson(input = {}) {
  const kind = clean(input.pass_kind || input.passKind || input.type || input.kind) === "founder" ? "founder" : "builder";
  return kind === "founder" ? founderApplePassJson(input) : builderApplePassJson(input);
}

function appleManifest(passJson = {}, assets = passAssets()) {
  const passJsonString = JSON.stringify(passJson);
  return {
    "pass.json": sha1(passJsonString),
    "logo.png": assets.logo.sha1,
    "logo@2x.png": assets["logo@2x"].sha1,
    "icon.png": assets.icon.sha1,
    "icon@2x.png": assets["icon@2x"].sha1
  };
}

function applePackagePlan(input = {}) {
  const pass = applePassJson(input);
  const kind = clean(input.pass_kind || input.passKind || input.type || input.kind) === "founder" ? "founder" : "builder";
  const assets = passAssets(kind);
  return {
    kind,
    signed: false,
    pass,
    manifest: appleManifest(pass, assets),
    assets,
    files: ["pass.json", "manifest.json", "signature", "logo.png", "logo@2x.png", "icon.png", "icon@2x.png"],
    signing: {
      required: true,
      configured: appleWalletConfigured(),
      method: "PKCS7 detached signature over manifest.json",
      required_environment: [
        "APPLE_WALLET_PASS_TYPE_IDENTIFIER or APPLE_WALLET_BUILDER_PASS_TYPE_IDENTIFIER / APPLE_WALLET_FOUNDER_PASS_TYPE_IDENTIFIER",
        "APPLE_WALLET_TEAM_IDENTIFIER",
        "APPLE_WALLET_CERTIFICATE",
        "APPLE_WALLET_PRIVATE_KEY",
        "APPLE_WALLET_WWDR_CERTIFICATE"
      ]
    }
  };
}

function googleWalletPayload(input = {}) {
  const kind = clean(input.pass_kind || input.passKind || input.type || input.kind) === "founder" ? "founder" : "builder";
  if (kind === "founder") {
    const identity = founderIdentity(input);
    return {
      issuerId: clean(process.env.GOOGLE_WALLET_ISSUER_ID) || "",
      classId: clean(process.env.GOOGLE_WALLET_FOUNDER_CLASS_ID) || "doneovernight_founder",
      objectSuffix: identity.founderId,
      state: "ACTIVE",
      cardTitle: identity.organization,
      subheader: identity.title,
      header: identity.name,
      barcode: { type: "QR_CODE", value: identity.qrUrl },
      textModulesData: [
        { id: "motto", header: "DONEOVERNIGHT", body: identity.motto },
        { id: "founder_id", header: "Founder ID", body: identity.founderId },
        { id: "website", header: "Website", body: identity.website },
        { id: "email", header: "Email", body: identity.email }
      ]
    };
  }
  const identity = builderIdentity(input);
  return {
    issuerId: clean(process.env.GOOGLE_WALLET_ISSUER_ID) || "",
    classId: clean(process.env.GOOGLE_WALLET_BUILDER_CLASS_ID) || clean(process.env.GOOGLE_WALLET_CLASS_ID) || "doneovernight_builder",
    objectSuffix: serialSafe(identity.journeyId || `builder_${identity.builderNumber}`),
    state: "ACTIVE",
    cardTitle: "DONEOVERNIGHT",
    subheader: identity.status,
    header: `Builder ${formatBuilderNumber(identity.builderNumber)}`,
    barcode: { type: "QR_CODE", value: identity.qrUrl },
    textModulesData: [
      { id: "type", header: "Builder Type", body: identity.builderType },
      { id: "journey", header: "Journey ID", body: identity.journeyId },
      { id: "joined", header: "Joined", body: identity.joinedAt.slice(0, 10) },
      { id: "completion", header: "Completion", body: `${identity.completion}%` },
      { id: "interests", header: "Primary Interests", body: identity.interests.join(", ") },
      { id: "path", header: "Chosen Path", body: identity.path },
      { id: "automation", header: "Automation Choice", body: identity.automationChoice.join(", ") },
      { id: "identity_line", header: "Identity", body: identity.identityLine }
    ].filter((item) => item.body)
  };
}

function appleWalletConfigured() {
  return Boolean(
    clean(process.env.APPLE_WALLET_TEAM_IDENTIFIER) &&
    clean(process.env.APPLE_WALLET_CERTIFICATE) &&
    clean(process.env.APPLE_WALLET_PRIVATE_KEY) &&
    clean(process.env.APPLE_WALLET_WWDR_CERTIFICATE) &&
    (
      clean(process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER) ||
      clean(process.env.APPLE_WALLET_BUILDER_PASS_TYPE_IDENTIFIER) ||
      clean(process.env.APPLE_WALLET_FOUNDER_PASS_TYPE_IDENTIFIER)
    )
  );
}

function googleWalletConfigured() {
  return Boolean(
    clean(process.env.GOOGLE_WALLET_ISSUER_ID) &&
    clean(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON) &&
    (
      clean(process.env.GOOGLE_WALLET_CLASS_ID) ||
      clean(process.env.GOOGLE_WALLET_BUILDER_CLASS_ID) ||
      clean(process.env.GOOGLE_WALLET_FOUNDER_CLASS_ID)
    )
  );
}

module.exports = {
  BASE_URL,
  CONNECT_URL,
  BUILDER_BASE_URL,
  LOGO_URL,
  builderIdentity,
  builderIdentityLine,
  founderIdentity,
  applePassJson,
  applePackagePlan,
  googleWalletPayload,
  appleWalletConfigured,
  googleWalletConfigured,
  formatBuilderNumber
};
