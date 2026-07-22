const HIERARCHY = Object.freeze([
  { level: 1, key: "breaking_news", label: "Breaking news", freshnessHours: 24, trustScore: 0.9, duplicateWindowHours: 168, cooldownHours: 18, qualityFloor: 0.72, relevanceFloor: 0.68, authorityScore: 0.9 },
  { level: 2, key: "industry_releases", label: "Industry releases", freshnessHours: 72, trustScore: 0.95, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: 0.7, relevanceFloor: 0.68, authorityScore: 0.95 },
  { level: 3, key: "x_discussions", label: "High-quality X discussions", freshnessHours: 48, trustScore: 0.78, duplicateWindowHours: 168, cooldownHours: 18, qualityFloor: 0.74, relevanceFloor: 0.7, authorityScore: 0.75 },
  { level: 4, key: "quote_opportunities", label: "Quote opportunities", freshnessHours: 72, trustScore: 0.82, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: 0.74, relevanceFloor: 0.72, authorityScore: 0.8 },
  { level: 5, key: "github_releases", label: "GitHub releases", freshnessHours: 168, trustScore: 0.96, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: 0.7, relevanceFloor: 0.68, authorityScore: 0.96 },
  { level: 6, key: "hacker_news", label: "Hacker News", freshnessHours: 72, trustScore: 0.76, duplicateWindowHours: 168, cooldownHours: 18, qualityFloor: 0.76, relevanceFloor: 0.72, authorityScore: 0.75 },
  { level: 7, key: "product_hunt", label: "Product Hunt", freshnessHours: 168, trustScore: 0.72, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: 0.76, relevanceFloor: 0.72, authorityScore: 0.7 },
  { level: 8, key: "evergreen_education", label: "Evergreen educational content", freshnessHours: 24 * 365, trustScore: 0.86, duplicateWindowHours: 720, cooldownHours: 72, qualityFloor: 0.8, relevanceFloor: 0.76, authorityScore: 0.82 },
  { level: 9, key: "founder_insights", label: "Founder insights", freshnessHours: 24 * 365, trustScore: 0.88, duplicateWindowHours: 720, cooldownHours: 72, qualityFloor: 0.8, relevanceFloor: 0.78, authorityScore: 0.84 },
  { level: 10, key: "internal_knowledge", label: "Internal knowledge", freshnessHours: 24 * 365, trustScore: 0.92, duplicateWindowHours: 720, cooldownHours: 72, qualityFloor: 0.82, relevanceFloor: 0.8, authorityScore: 0.9 },
  { level: 11, key: "historical_lessons", label: "Historical lessons", freshnessHours: 24 * 3650, trustScore: 0.86, duplicateWindowHours: 1440, cooldownHours: 120, qualityFloor: 0.8, relevanceFloor: 0.76, authorityScore: 0.82 },
  { level: 12, key: "scheduled_campaigns", label: "Scheduled campaigns", freshnessHours: 24 * 3650, trustScore: 0.9, duplicateWindowHours: 1440, cooldownHours: 120, qualityFloor: 0.82, relevanceFloor: 0.8, authorityScore: 0.86 }
]);

const BY_KEY = new Map(HIERARCHY.map((tier) => [tier.key, tier]));

function policyFor(value) {
  if (!value) return null;
  if (typeof value === "string") return BY_KEY.get(value) || null;
  return value.discovery_tier ? BY_KEY.get(value.discovery_tier) || null : BY_KEY.get(value.tier || value.level_key) || null;
}

function tokens(value = "") {
  return new Set(String(value).toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2));
}

function similarity(a, b) {
  const left = tokens(a); const right = tokens(b); if (!left.size || !right.size) return 0;
  let overlap = 0; for (const word of left) if (right.has(word)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

function freshnessScore(candidate, policy, now = Date.now()) {
  const published = new Date(candidate.publishedAt || candidate.published_at || candidate.created_at || now).getTime();
  if (!Number.isFinite(published)) return 0;
  const ageHours = Math.max(0, (now - published) / 3_600_000);
  return { ageHours, score: Math.max(0, 1 - (ageHours / Math.max(1, policy.freshnessHours))) };
}

function scoreDiscoveryCandidate(candidate, context = {}) {
  const policy = policyFor(candidate) || policyFor(context.policy) || HIERARCHY[0];
  const now = context.now || Date.now(); const freshness = freshnessScore(candidate, policy, now);
  const quality = Math.max(0, Math.min(1, Number(candidate.quality_score ?? candidate.quality ?? candidate.editorial_quality ?? 0.7)));
  const relevance = Math.max(0, Math.min(1, Number(candidate.relevance_score ?? candidate.relevance ?? candidate.publish_score ?? 0.7)));
  const authority = Math.max(0, Math.min(1, Number(candidate.authority_score ?? candidate.authority ?? policy.authorityScore)));
  const trust = Math.max(0, Math.min(1, Number(candidate.trust_score ?? candidate.trust ?? policy.trustScore)));
  const novelty = Math.max(0, Math.min(1, Number(candidate.novelty_score ?? candidate.novelty ?? 0.75)));
  const existing = [...(context.existingCandidates || []), ...(context.recentDrafts || [])];
  const duplicateScore = Math.max(0, ...existing.map((row) => similarity(candidate.title || candidate.headline, row.title || row.headline || row.text)));
  const topic = String(candidate.topic_cluster || candidate.topic || "").toLowerCase();
  const cooldownMs = policy.cooldownHours * 3_600_000;
  const cooldown = (context.recentPublications || []).some((row) => {
    const sameTopic = topic && String(row.topic_cluster || row.topic || "").toLowerCase() === topic;
    const at = new Date(row.published_at || row.created_at || 0).getTime(); return sameTopic && Number.isFinite(at) && now - at < cooldownMs;
  });
  const confidence = Math.round((quality * 0.24 + relevance * 0.2 + authority * 0.18 + trust * 0.16 + freshness.score * 0.12 + novelty * 0.1) * 1000) / 1000;
  const eligible = freshness.score > 0 && quality >= policy.qualityFloor && relevance >= policy.relevanceFloor && authority >= policy.authorityScore && trust >= policy.trustScore && duplicateScore < 0.82 && !cooldown;
  return { tier: policy.key, hierarchy_level: policy.level, policy, confidence, eligible, duplicate_score: Math.round(duplicateScore * 1000) / 1000, cooldown, freshness: { age_hours: Math.round(freshness.ageHours * 100) / 100, score: Math.round(freshness.score * 1000) / 1000 }, scores: { quality, relevance, authority, trust, novelty }, provenance: { hierarchy_level: policy.level, hierarchy_key: policy.key, selected_at: new Date(now).toISOString(), freshness_window_hours: policy.freshnessHours, trust_score: policy.trustScore, duplicate_window_hours: policy.duplicateWindowHours, cooldown_hours: policy.cooldownHours, quality_floor: policy.qualityFloor, relevance_floor: policy.relevanceFloor, authority_score: policy.authorityScore } };
}

function selectHierarchicalCandidate(candidates, context = {}) {
  const evaluated = (candidates || []).map((candidate) => ({ candidate, evaluation: scoreDiscoveryCandidate(candidate, context) }));
  for (const tier of HIERARCHY) {
    const eligible = evaluated.filter((row) => row.evaluation.tier === tier.key && row.evaluation.eligible).sort((a, b) => b.evaluation.confidence - a.evaluation.confidence);
    if (eligible.length) return { ...eligible[0], evaluated, fallback_used: tier.level > 1, selected_level: tier.level };
  }
  return { candidate: null, evaluation: null, evaluated, fallback_used: false, selected_level: null };
}

function internalKnowledgeCandidate(knowledge, now = Date.now()) {
  if (!knowledge || !String(knowledge.text || knowledge.insight || "").trim()) return null;
  const text = String(knowledge.text || knowledge.insight).trim();
  return { id: knowledge.id || `internal-${now}`, title: knowledge.title || "DONEOVERNIGHT operating insight", summary: knowledge.evidence || knowledge.reason || "Workspace-provided operating knowledge.", source_url: knowledge.source_url || "https://doneovernight.com", sourceUrl: knowledge.source_url || "https://doneovernight.com", publisher: "DONEOVERNIGHT", topic_cluster: knowledge.topic_cluster || knowledge.topic || "internal knowledge", publishedAt: knowledge.updated_at || knowledge.created_at || new Date(now).toISOString(), trust_score: 0.92, authority_score: 0.9, relevance_score: Number(knowledge.relevance_score || 0.82), quality_score: Number(knowledge.quality_score || 0.84), novelty_score: Number(knowledge.novelty_score || 0.8), internal_provenance: { kind: "workspace_knowledge", evidence: knowledge.evidence || knowledge.reason || "Provided by the active workspace", selected_at: new Date(now).toISOString() } };
}

module.exports = { HIERARCHY, policyFor, scoreDiscoveryCandidate, selectHierarchicalCandidate, internalKnowledgeCandidate, similarity };
