const { sanitizeSourceText } = require("./validation");

const REGISTRY = [
  { publisher: "OpenAI", url: "https://openai.com/news/rss.xml", authority: 1, officialX: "OpenAI", discovery_tier: "industry_releases", freshnessHours: 72, trustScore: .97, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: .7, relevanceFloor: .68 },
  { publisher: "Google AI", url: "https://blog.google/technology/ai/rss/", authority: 1, officialX: "GoogleAI", discovery_tier: "industry_releases", freshnessHours: 72, trustScore: .97, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: .7, relevanceFloor: .68 },
  { publisher: "GitHub", url: "https://github.blog/changelog/feed/", authority: 1, officialX: "github", discovery_tier: "github_releases", freshnessHours: 168, trustScore: .98, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: .7, relevanceFloor: .68 },
  { publisher: "Vercel", url: "https://vercel.com/changelog/rss", authority: 1, officialX: "vercel", discovery_tier: "industry_releases", freshnessHours: 72, trustScore: .97, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: .7, relevanceFloor: .68 },
  { publisher: "Supabase", url: "https://supabase.com/rss.xml", authority: 1, officialX: "supabase", discovery_tier: "industry_releases", freshnessHours: 72, trustScore: .97, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: .7, relevanceFloor: .68 },
  { publisher: "n8n", url: "https://blog.n8n.io/rss/", authority: 1, officialX: "n8n", discovery_tier: "industry_releases", freshnessHours: 72, trustScore: .94, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: .7, relevanceFloor: .68 },
  { publisher: "Hacker News", url: "https://news.ycombinator.com/rss", authority: .76, discovery_tier: "hacker_news", freshnessHours: 72, trustScore: .76, duplicateWindowHours: 168, cooldownHours: 18, qualityFloor: .76, relevanceFloor: .72 },
  { publisher: "Product Hunt", url: "https://www.producthunt.com/feed", authority: .72, discovery_tier: "product_hunt", freshnessHours: 168, trustScore: .72, duplicateWindowHours: 336, cooldownHours: 18, qualityFloor: .76, relevanceFloor: .72 }
];
function decode(value = "") { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function tag(xml, name) { const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i")); return match ? decode(match[1]).trim() : ""; }
function parseFeed(xml, source) {
  const chunks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(item|entry)>/gi) || [];
  return chunks.map((chunk) => {
    const linkElement = chunk.match(/<link[^>]+href=["']([^"']+)["']/i);
    const url = linkElement?.[1] || tag(chunk, "link");
    const publishedAt = tag(chunk, "pubDate") || tag(chunk, "published") || tag(chunk, "updated") || new Date().toISOString();
    return { sourceUrl: url, title: tag(chunk, "title"), summary: sanitizeSourceText(tag(chunk, "description") || tag(chunk, "summary") || tag(chunk, "content")), publishedAt, publisher: source.publisher, authority: source.authority, officialX: source.officialX };
  }).filter((item) => item.sourceUrl && item.title);
}
async function fetchSource(source) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(source.url, { headers: { "User-Agent": "DONEOVERNIGHT-Content-Agent/1.0 (+https://doneovernight.com)" }, signal: controller.signal });
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
    return parseFeed(await response.text(), source);
  } finally { clearTimeout(timeout); }
}
module.exports = { REGISTRY, fetchSource };
