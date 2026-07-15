const { sanitizeSourceText } = require("./validation");

const REGISTRY = [
  { publisher: "OpenAI", url: "https://openai.com/news/rss.xml", authority: 1 },
  { publisher: "Anthropic", url: "https://www.anthropic.com/rss.xml", authority: 1 },
  { publisher: "Google AI", url: "https://blog.google/technology/ai/rss/", authority: 1 },
  { publisher: "GitHub", url: "https://github.blog/changelog/feed/", authority: 1 },
  { publisher: "Vercel", url: "https://vercel.com/changelog/rss", authority: 1 },
  { publisher: "Supabase", url: "https://supabase.com/changelog/rss.xml", authority: 1 },
  { publisher: "n8n", url: "https://n8n.io/changelog/rss.xml", authority: 1 }
];
function decode(value = "") { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function tag(xml, name) { const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i")); return match ? decode(match[1]).trim() : ""; }
function parseFeed(xml, source) {
  const chunks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(item|entry)>/gi) || [];
  return chunks.map((chunk) => {
    const linkElement = chunk.match(/<link[^>]+href=["']([^"']+)["']/i);
    const url = linkElement?.[1] || tag(chunk, "link");
    const publishedAt = tag(chunk, "pubDate") || tag(chunk, "published") || tag(chunk, "updated") || new Date().toISOString();
    return { sourceUrl: url, title: tag(chunk, "title"), summary: sanitizeSourceText(tag(chunk, "description") || tag(chunk, "summary") || tag(chunk, "content")), publishedAt, publisher: source.publisher, authority: source.authority };
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
