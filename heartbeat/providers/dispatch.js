const { unavailable } = require("./utils");

async function getDispatchSummary() {
  return {
    shown: unavailable("Dispatch Shown", "Dispatch analytics source not connected"),
    intent: unavailable("Dispatch Intent", "Dispatch analytics source not connected"),
    signups: unavailable("Dispatch Signups", "Dispatch signup source not connected")
  };
}

module.exports = {
  getDispatchSummary
};
