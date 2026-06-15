async function getRecommendation(summary) {
  const health = summary.health || {};
  const operations = summary.operations || {};
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

  const focus = [];
  const pendingReview = Number(operations.asks?.pendingReview?.value || 0);
  const quoteNeeded = Number(operations.asks?.quoteNeeded?.value || 0);
  const awaitingPayment = Number(operations.asks?.awaitingPayment?.value || 0);
  const pendingOperators = Number(operations.operators?.pending?.value || 0);

  if (pendingReview > 0) focus.push(`${pendingReview} ask${pendingReview === 1 ? "" : "s"} waiting for review.`);
  if (quoteNeeded > 0) focus.push(`${quoteNeeded} quote${quoteNeeded === 1 ? "" : "s"} need preparation.`);
  if (awaitingPayment > 0) focus.push(`${awaitingPayment} quote${awaitingPayment === 1 ? "" : "s"} awaiting payment.`);
  if (pendingOperators > 0) focus.push(`${pendingOperators} operator application${pendingOperators === 1 ? "" : "s"} pending.`);

  if (focus.length) return focus.slice(0, 3).join(" ");

  return "No operational bottlenecks detected.";
}

module.exports = {
  getRecommendation
};
