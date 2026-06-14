const { unavailable } = require("./utils");

async function getAnalyticsSummary() {
  return {
    traffic: {
      homepageVisits: unavailable("Homepage Visits", "Analytics API not connected in Phase 1"),
      startVisits: unavailable("Start Visits", "Analytics API not connected in Phase 1"),
      taskVisits: unavailable("Task Visits", "Analytics API not connected in Phase 1")
    },
    conversions: {
      startOpened: unavailable("START Opened", "Plausible/Vercel event API not connected in Phase 1"),
      startClosed: unavailable("START Closed", "Plausible/Vercel event API not connected in Phase 1"),
      taskSubmitted: unavailable("Task Submitted", "Plausible/Vercel event API not connected in Phase 1"),
      dispatchShown: unavailable("Dispatch Shown", "Plausible/Vercel event API not connected in Phase 1"),
      dispatchIntent: unavailable("Dispatch Intent", "Plausible/Vercel event API not connected in Phase 1")
    },
    placeholders: {
      leads: unavailable("Leads", "Reserved for Phase 2"),
      contacts: unavailable("Contacts", "Reserved for crm_contacts in Phase 2"),
      dispatch: unavailable("Dispatch", "Reserved for Dispatch metrics in Phase 2")
    }
  };
}

module.exports = {
  getAnalyticsSummary
};
