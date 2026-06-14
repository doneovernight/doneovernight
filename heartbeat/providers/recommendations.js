async function getRecommendation(summary) {
  const health = summary.health || {};
  const attention = Object.values(health).filter((item) => item?.status === "Needs attention");
  const unavailable = [
    summary.analytics?.traffic?.homepageVisits,
    summary.performance?.fcp
  ].filter((item) => item?.status === "Unavailable");

  if (attention.length) {
    return `Check ${attention.map((item) => item.source).join(", ")} first.`;
  }

  if (unavailable.length) {
    return "Connect analytics and Speed Insights APIs next so Heartbeat can report real traffic and performance numbers.";
  }

  return "Review traffic, conversions, and performance, then pick one improvement for today.";
}

module.exports = {
  getRecommendation
};
