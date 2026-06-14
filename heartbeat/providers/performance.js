const { unavailable } = require("./utils");

async function getPerformanceSummary() {
  return {
    fcp: unavailable("FCP", "Vercel Speed Insights API not connected in Phase 1"),
    lcp: unavailable("LCP", "Vercel Speed Insights API not connected in Phase 1"),
    ttfb: unavailable("TTFB", "Vercel Speed Insights API not connected in Phase 1")
  };
}

module.exports = {
  getPerformanceSummary
};
