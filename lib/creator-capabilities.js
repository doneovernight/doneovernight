(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CreatorCapabilities = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const registry = [
    ["live", "Live", "Runtime", "live_enabled", { admin: true, public: true, runtime: true, api: true, pageBuilder: true }],
    ["battle", "Battle", "Runtime", "battle_enabled", { admin: true, public: true, runtime: true, api: true, pageBuilder: true, requires: ["live"] }],
    ["countdown", "Countdown", "Runtime", "countdown_enabled", { admin: true, public: true, runtime: true, api: true, pageBuilder: true }],
    ["announcements", "Announcements", "Runtime", "announcements_enabled", { admin: true, public: true, runtime: true, api: true, pageBuilder: true }],
    ["events", "Events", "Growth", "events_enabled", { admin: true, public: true, api: true, pageBuilder: true }],
    ["portfolio", "Portfolio", "Growth", "portfolio_enabled", { admin: true, public: true, api: true, pageBuilder: true }],
    ["business", "Business", "Growth", "", { admin: true, public: true, api: true, pageBuilder: true }],
    ["newsletter", "Newsletter", "Growth", "newsletter_enabled", { admin: true, public: true, api: true, pageBuilder: true }],
    ["community", "Community", "Community", "community_enabled", { admin: true, public: true, api: true, pageBuilder: true }],
    ["support", "Support", "Community", "support_enabled", { admin: true, public: true, api: true, pageBuilder: true }],
    ["shop", "Shop", "Commerce", "", { admin: true, public: true, api: true, pageBuilder: true }],
    ["music", "Music", "Media", "", { admin: true, public: true, api: true, pageBuilder: true }],
    ["ai_assistant", "AI Assistant", "Advanced", "", { admin: true, public: true, runtime: true, api: true, pageBuilder: true }],
    ["timeline", "Timeline", "Story", "", { admin: true, public: true, api: true, pageBuilder: true }],
    ["featured_project", "Featured Project", "Story", "", { admin: true, public: true, api: true, pageBuilder: true }],
    ["resources", "Resources", "Story", "", { admin: true, public: true, api: true, pageBuilder: true }],
    ["gallery", "Gallery", "Story", "", { admin: true, public: true, api: true, pageBuilder: true }],
    ["testimonials", "Testimonials", "Story", "", { admin: true, public: true, api: true, pageBuilder: true }],
    ["wishlist", "Wishlist", "Commerce", "", { admin: true, public: true, api: true, pageBuilder: true }]
  ].map(([key, label, group, legacyField, controls]) => ({
    key,
    label,
    group,
    legacyField,
    controls,
    defaultValue: false
  }));

  const byKey = registry.reduce((map, capability) => {
    map[capability.key] = capability;
    return map;
  }, {});

  const templatePresets = {
    blank: {},
    streamer: {
      live: true,
      battle: true,
      countdown: true,
      community: true,
      support: true,
      announcements: true
    },
    creative_founder: {
      events: true,
      portfolio: true,
      business: true,
      timeline: true,
      featured_project: true,
      announcements: true,
      newsletter: true,
      live: false,
      battle: false
    },
    founder: {
      events: true,
      portfolio: true,
      business: true,
      timeline: true,
      featured_project: true,
      announcements: true,
      newsletter: true,
      live: false,
      battle: false
    },
    editorial: {
      events: true,
      portfolio: true,
      business: true,
      timeline: true,
      featured_project: true,
      announcements: true,
      newsletter: true,
      live: false,
      battle: false
    },
    fitness: {
      live: true,
      countdown: true,
      community: true,
      support: true,
      announcements: true
    }
  };

  const dnaToTemplate = {
    streamer: "streamer",
    gamer: "streamer",
    founder: "creative_founder",
    editorial: "creative_founder",
    business: "creative_founder",
    coach: "creative_founder",
    fitness: "fitness"
  };

  function cleanKey(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function templateForCreator(settings = {}) {
    const raw = cleanKey(settings.capability_template || settings.template || settings.creator_dna || "");
    return templatePresets[raw] ? raw : (dnaToTemplate[raw] || "blank");
  }

  function emptyCapabilityMap() {
    return registry.reduce((map, capability) => {
      map[capability.key] = capability.defaultValue === true;
      return map;
    }, {});
  }

  function parseCapabilities(value) {
    if (!value) return {};
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (error) {
        return {};
      }
    }
    return typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeCapabilities(settings = {}, options = {}) {
    const capabilities = emptyCapabilityMap();
    const template = options.template || templateForCreator(settings);
    Object.assign(capabilities, templatePresets[template] || {});

    registry.forEach((capability) => {
      if (capability.legacyField && Object.prototype.hasOwnProperty.call(settings, capability.legacyField)) {
        capabilities[capability.key] = settings[capability.legacyField] === true;
      }
    });

    const stored = parseCapabilities(settings.capabilities);
    registry.forEach((capability) => {
      if (Object.prototype.hasOwnProperty.call(stored, capability.key)) {
        capabilities[capability.key] = stored[capability.key] === true;
      }
    });

    if (capabilities.battle && !capabilities.live) capabilities.battle = false;
    return capabilities;
  }

  function hasCapability(settings = {}, key, fallbackValue) {
    const normalizedKey = cleanKey(key).replace(/_enabled$/, "");
    const capability = byKey[normalizedKey];
    if (!capability) return fallbackValue === undefined ? false : Boolean(fallbackValue);
    return normalizeCapabilities(settings)[capability.key] === true;
  }

  function mirrorLegacyFields(settings = {}, capabilities = normalizeCapabilities(settings)) {
    const result = { capabilities: { ...capabilities } };
    registry.forEach((capability) => {
      if (capability.legacyField) result[capability.legacyField] = capabilities[capability.key] === true;
    });
    return result;
  }

  return {
    registry,
    byKey,
    templatePresets,
    dnaToTemplate,
    normalizeCapabilities,
    hasCapability,
    mirrorLegacyFields,
    templateForCreator
  };
});
