function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function builderIdentity(input = {}) {
  const builderNumber = clean(input.builder_number || input.builderNumber);
  const journeyId = clean(input.journey_id || input.journeyId);
  return {
    journeyId,
    builderNumber,
    builderType: clean(input.builder_type || input.builderType) || "Builder",
    status: clean(input.status) || "Founding Builder",
    joinedAt: clean(input.joined_at || input.joinedAt) || new Date().toISOString(),
    completion: Number(input.completion || 0),
    path: clean(input.path),
    interests: Array.isArray(input.interests) ? input.interests.map(clean).filter(Boolean) : [],
    automationChoice: Array.isArray(input.automation_choice || input.automationChoice)
      ? (input.automation_choice || input.automationChoice).map(clean).filter(Boolean)
      : []
  };
}

function applePassJson(input = {}) {
  const identity = builderIdentity(input);
  return {
    formatVersion: 1,
    passTypeIdentifier: clean(process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER) || "pass.com.doneovernight.builder",
    serialNumber: identity.journeyId || `DON-BUILDER-${identity.builderNumber}`,
    teamIdentifier: clean(process.env.APPLE_WALLET_TEAM_IDENTIFIER) || "",
    organizationName: "DONEOVERNIGHT",
    description: "DONEOVERNIGHT Builder Card",
    logoText: "DONEOVERNIGHT",
    foregroundColor: "rgb(245,241,232)",
    backgroundColor: "rgb(5,6,8)",
    labelColor: "rgb(233,196,138)",
    generic: {
      primaryFields: [
        { key: "builder", label: "Builder", value: `#${identity.builderNumber}` }
      ],
      secondaryFields: [
        { key: "status", label: "Status", value: identity.status },
        { key: "type", label: "Type", value: identity.builderType }
      ],
      auxiliaryFields: [
        { key: "joined", label: "Joined", value: identity.joinedAt.slice(0, 10) },
        { key: "journey", label: "Journey ID", value: identity.journeyId }
      ],
      backFields: [
        { key: "path", label: "Path", value: identity.path },
        { key: "interests", label: "Interests", value: identity.interests.join(", ") },
        { key: "completion", label: "Completion", value: `${identity.completion}%` }
      ]
    }
  };
}

function googleWalletPayload(input = {}) {
  const identity = builderIdentity(input);
  return {
    issuerId: clean(process.env.GOOGLE_WALLET_ISSUER_ID) || "",
    classId: clean(process.env.GOOGLE_WALLET_CLASS_ID) || "doneovernight_builder",
    objectSuffix: identity.journeyId || `builder_${identity.builderNumber}`,
    state: "ACTIVE",
    cardTitle: "DONEOVERNIGHT",
    subheader: identity.status,
    header: `Builder #${identity.builderNumber}`,
    textModulesData: [
      { id: "type", header: "Builder Type", body: identity.builderType },
      { id: "journey", header: "Journey ID", body: identity.journeyId },
      { id: "joined", header: "Joined", body: identity.joinedAt.slice(0, 10) },
      { id: "completion", header: "Completion", body: `${identity.completion}%` }
    ]
  };
}

function appleWalletConfigured() {
  return Boolean(
    clean(process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER) &&
    clean(process.env.APPLE_WALLET_TEAM_IDENTIFIER) &&
    clean(process.env.APPLE_WALLET_CERTIFICATE) &&
    clean(process.env.APPLE_WALLET_PRIVATE_KEY) &&
    clean(process.env.APPLE_WALLET_WWDR_CERTIFICATE)
  );
}

function googleWalletConfigured() {
  return Boolean(
    clean(process.env.GOOGLE_WALLET_ISSUER_ID) &&
    clean(process.env.GOOGLE_WALLET_CLASS_ID) &&
    clean(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON)
  );
}

module.exports = {
  builderIdentity,
  applePassJson,
  googleWalletPayload,
  appleWalletConfigured,
  googleWalletConfigured
};
