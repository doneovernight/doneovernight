async function getRecommendation(summary) {
  const health = summary.health || {};
  const operational = [
    health.website,
    health.askWebsite,
    health.startWebsite,
    health.portalReview,
    health.adminWebsite,
    health.workspace,
    health.supabase
  ];
  const attention = operational.filter((item) => item?.status === "Needs attention");
  const unavailable = operational.filter((item) => item?.status === "Unavailable");

  if (attention.length) {
    return `Check ${attention.map((item) => item.source).join(", ")} first.`;
  }

  if (unavailable.length) {
    return `Configure ${unavailable.map((item) => item.source).join(", ")} to complete operational coverage.`;
  }

  return "All operational checks are online.";
}

module.exports = {
  getRecommendation
};
