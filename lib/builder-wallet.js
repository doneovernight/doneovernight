const crypto = require("crypto");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE_URL = "https://doneovernight.com";
const CONNECT_URL = `${BASE_URL}/connect`;
const FOUNDER_URL = `${BASE_URL}/don`;
const BUILDER_BASE_URL = `${BASE_URL}/builder`;
const TIKTOK_URL = "https://www.tiktok.com/@doneovernight";
const INSTAGRAM_URL = "https://www.instagram.com/doneovernight";
const LINKEDIN_URL = "https://www.linkedin.com/company/doneovernight";
const LOGO_URL = `${BASE_URL}/brand/doneovernight-white.png`;
const LOGO_NEUTRAL_URL = `${BASE_URL}/brand/doneovernight-neutral.png`;
const ICON_URL = `${BASE_URL}/icon-192.png`;
const ICON_2X_URL = `${BASE_URL}/icon-512.png`;
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

function sha1Buffer(value) {
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
    qrUrl: FOUNDER_URL,
    links: {
      instagram: INSTAGRAM_URL,
      tiktok: TIKTOK_URL,
      linkedin: LINKEDIN_URL,
      email: "mailto:ask@doneovernight.com",
      website: BASE_URL,
      ask: "https://ask.doneovernight.com",
      connect: CONNECT_URL,
      founder: FOUNDER_URL,
      howItWorks: `${BASE_URL}/how-it-works`,
      live: `${BASE_URL}/live`,
      resources: `${BASE_URL}/resources`,
      journal: `${BASE_URL}/journal`,
      products: `${BASE_URL}/products`
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
      source: ICON_URL,
      role: "icon.png",
      sha1: sha1File("icon-192.png", ICON_URL)
    },
    "icon@2x": {
      source: ICON_2X_URL,
      role: "icon@2x.png",
      sha1: sha1File("icon-512.png", ICON_2X_URL)
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
    passTypeIdentifier: applePassTypeIdentifier("founder") || FOUNDER_PASS_TYPE,
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
        { key: "role", label: identity.organization, value: identity.role },
        { key: "founder_id", label: "Founder ID", value: identity.founderId }
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
    passTypeIdentifier: applePassTypeIdentifier("builder") || DEFAULT_PASS_TYPE,
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

function readAssetBuffer(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath));
}

function applePassFiles(input = {}) {
  const pass = applePassJson(input);
  const passJson = Buffer.from(JSON.stringify(pass), "utf8");
  const files = {
    "pass.json": passJson,
    "logo.png": readAssetBuffer("brand/doneovernight-white.png"),
    "logo@2x.png": readAssetBuffer("brand/doneovernight-white.png"),
    "icon.png": readAssetBuffer("icon-192.png"),
    "icon@2x.png": readAssetBuffer("icon-512.png")
  };
  const manifest = Object.fromEntries(Object.entries(files).map(([name, buffer]) => [name, sha1Buffer(buffer)]));
  files["manifest.json"] = Buffer.from(JSON.stringify(manifest), "utf8");
  return { pass, files, manifest };
}

function applePackagePlan(input = {}) {
  const pass = applePassJson(input);
  const kind = clean(input.pass_kind || input.passKind || input.type || input.kind) === "founder" ? "founder" : "builder";
  const assets = passAssets(kind);
  const signing = appleSigningStatus(kind);
  return {
    kind,
    signed: false,
    pass,
    manifest: appleManifest(pass, assets),
    assets,
    files: ["pass.json", "manifest.json", "signature", "logo.png", "logo@2x.png", "icon.png", "icon@2x.png"],
    signing: {
      required: true,
      configured: signing.configured,
      missing: signing.missing,
      method: "PKCS7 detached signature over manifest.json",
      required_environment: [
        "APPLE_WALLET_PASS_TYPE_IDENTIFIER_FOUNDER or APPLE_WALLET_FOUNDER_PASS_TYPE_IDENTIFIER",
        "APPLE_WALLET_TEAM_IDENTIFIER",
        "APPLE_WALLET_CERTIFICATE",
        "APPLE_WALLET_PRIVATE_KEY",
        "APPLE_WALLET_WWDR_CERTIFICATE"
      ]
    }
  };
}

function envValue(name) {
  return clean(process.env[name]);
}

function applePassTypeIdentifier(kind = "builder") {
  if (kind === "founder") {
    return envValue("APPLE_WALLET_PASS_TYPE_IDENTIFIER_FOUNDER") ||
      envValue("APPLE_WALLET_FOUNDER_PASS_TYPE_IDENTIFIER") ||
      envValue("APPLE_WALLET_PASS_TYPE_IDENTIFIER");
  }
  return envValue("APPLE_WALLET_PASS_TYPE_IDENTIFIER_BUILDER") ||
    envValue("APPLE_WALLET_BUILDER_PASS_TYPE_IDENTIFIER") ||
    envValue("APPLE_WALLET_PASS_TYPE_IDENTIFIER");
}

function appleSigningStatus(kind = "builder") {
  const passTypeNames = kind === "founder"
    ? ["APPLE_WALLET_PASS_TYPE_IDENTIFIER_FOUNDER", "APPLE_WALLET_FOUNDER_PASS_TYPE_IDENTIFIER", "APPLE_WALLET_PASS_TYPE_IDENTIFIER"]
    : ["APPLE_WALLET_PASS_TYPE_IDENTIFIER_BUILDER", "APPLE_WALLET_BUILDER_PASS_TYPE_IDENTIFIER", "APPLE_WALLET_PASS_TYPE_IDENTIFIER"];
  const missing = [];
  if (!envValue("APPLE_WALLET_TEAM_IDENTIFIER")) missing.push("APPLE_WALLET_TEAM_IDENTIFIER");
  if (!applePassTypeIdentifier(kind)) missing.push(kind === "founder" ? "APPLE_WALLET_PASS_TYPE_IDENTIFIER_FOUNDER" : "APPLE_WALLET_PASS_TYPE_IDENTIFIER_BUILDER");
  ["APPLE_WALLET_CERTIFICATE", "APPLE_WALLET_PRIVATE_KEY", "APPLE_WALLET_WWDR_CERTIFICATE"].forEach((name) => {
    if (!envValue(name)) missing.push(name);
  });
  return {
    configured: missing.length === 0,
    missing,
    pass_type_identifier: applePassTypeIdentifier(kind) ? "configured" : "",
    supported_pass_type_env: passTypeNames
  };
}

function decodePemEnv(name) {
  const value = envValue(name);
  if (!value) return "";
  const normalized = value.replace(/\\n/g, "\n");
  if (normalized.includes("-----BEGIN")) return normalized;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").replace(/\\n/g, "\n");
    if (decoded.includes("-----BEGIN")) return decoded;
  } catch (error) {}
  return normalized;
}

function createAppleSignature(manifestBuffer) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doneovernight-pass-"));
  try {
    const certPath = path.join(tempDir, "certificate.pem");
    const keyPath = path.join(tempDir, "private-key.pem");
    const wwdrPath = path.join(tempDir, "wwdr.pem");
    const manifestPath = path.join(tempDir, "manifest.json");
    const signaturePath = path.join(tempDir, "signature");
    fs.writeFileSync(certPath, decodePemEnv("APPLE_WALLET_CERTIFICATE"));
    fs.writeFileSync(keyPath, decodePemEnv("APPLE_WALLET_PRIVATE_KEY"));
    fs.writeFileSync(wwdrPath, decodePemEnv("APPLE_WALLET_WWDR_CERTIFICATE"));
    fs.writeFileSync(manifestPath, manifestBuffer);
    const args = [
      "smime",
      "-binary",
      "-sign",
      "-certfile", wwdrPath,
      "-signer", certPath,
      "-inkey", keyPath,
      "-in", manifestPath,
      "-out", signaturePath,
      "-outform", "DER"
    ];
    const password = envValue("APPLE_WALLET_PRIVATE_KEY_PASSWORD");
    if (password) args.push("-passin", `pass:${password}`);
    execFileSync("openssl", args, { stdio: "ignore" });
    return fs.readFileSync(signaturePath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function zipStore(files = {}) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();
  Object.entries(files).forEach(([name, content]) => {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const filename = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, filename);
    offset += local.length + filename.length + data.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function createSignedApplePassPackage(input = {}) {
  const kind = clean(input.pass_kind || input.passKind || input.type || input.kind) === "founder" ? "founder" : "builder";
  const signing = appleSigningStatus(kind);
  const plan = applePackagePlan(input);
  if (!signing.configured) return { configured: false, signed: false, status: "wallet_certificates_required", missing: signing.missing, package: plan };
  const prepared = applePassFiles(input);
  const signature = createAppleSignature(prepared.files["manifest.json"]);
  const files = { ...prepared.files, signature };
  return {
    configured: true,
    signed: true,
    status: "issued",
    missing: [],
    package: {
      ...plan,
      signed: true,
      pass: prepared.pass,
      manifest: prepared.manifest
    },
    buffer: zipStore(files)
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
        { id: "ask", header: "Ask", body: identity.links.ask },
        { id: "how_it_works", header: "How It Works", body: identity.links.howItWorks },
        { id: "live", header: "Live", body: identity.links.live },
        { id: "email", header: "Email", body: identity.email },
        { id: "instagram", header: "Instagram", body: identity.links.instagram },
        { id: "tiktok", header: "TikTok", body: identity.links.tiktok },
        { id: "linkedin", header: "LinkedIn", body: identity.links.linkedin }
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
  return appleSigningStatus("founder").configured || appleSigningStatus("builder").configured;
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
  FOUNDER_URL,
  BUILDER_BASE_URL,
  LOGO_URL,
  builderIdentity,
  builderIdentityLine,
  founderIdentity,
  applePassJson,
  applePackagePlan,
  appleSigningStatus,
  createSignedApplePassPackage,
  googleWalletPayload,
  appleWalletConfigured,
  googleWalletConfigured,
  formatBuilderNumber
};
