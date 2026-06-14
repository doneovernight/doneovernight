const { unavailable } = require("./utils");

async function getCaseStudySummary() {
  return {
    published: unavailable("Case Studies Published", "Case study source not connected"),
    frameworks: unavailable("Case Study Frameworks", "Reserved for Phase 2 content inventory"),
    approvals: unavailable("Case Study Approvals", "Reserved for approved public proof workflow")
  };
}

module.exports = {
  getCaseStudySummary
};
