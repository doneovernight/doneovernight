const { unavailable } = require("./utils");

async function getSearchConsoleSummary() {
  return {
    indexing: unavailable("Search Console Indexing", "Search Console API not connected"),
    submittedPages: unavailable("Search Console Submitted Pages", "Search Console API not connected"),
    canonicalPages: unavailable("Search Console Canonicals", "Search Console API not connected"),
    excludedPages: unavailable("Search Console Excluded Pages", "Search Console API not connected")
  };
}

module.exports = {
  getSearchConsoleSummary
};
