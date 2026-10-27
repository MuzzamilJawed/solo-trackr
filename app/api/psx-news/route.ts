import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

// Pakistan market news from public RSS feeds (the syndication feeds the
// publishers offer for exactly this): Business Recorder, Dawn Business,
// The Express Tribune Business, and a Google News query on PSX / KSE-100.
// Items link out to the publisher — we show headline + short summary only.

interface Feed { source: string; url: string }

const FEEDS: Feed[] = [
  { source: "Business Recorder", url: "https://www.brecorder.com/feeds/latest-news" },
  { source: "Dawn", url: "https://www.dawn.com/feeds/business" },
  { source: "Express Tribune", url: "https://tribune.com.pk/feed/business" },
  {
    source: "Google News",
    url: "https://news.google.com/rss/search?q=%22PSX%22+OR+%22KSE-100%22+OR+%22Pakistan+Stock+Exchange%22+OR+%22book+closure%22+when:3d&hl=en-PK&gl=PK&ceid=PK:en",
  },
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number; // epoch ms
  summary: string;
  announcement: boolean; // dividend / book closure / results / AGM …
}

// Headline-only: summaries mention "earnings"/"dividend" in passing far too often
// (a Europe market wrap, a company profile) to flag them as announcements.
const ANNOUNCEMENT = /\b(book closure|dividends?|bonus (shares?|issue)|right (shares?|issue)|final cash|financial results|(quarterly|annual|half[- ]yearly|nine[- ]month|first[- ]quarter|second[- ]quarter|third[- ]quarter) (results|earnings|profit)|board meeting|agm|egm|annual general meeting|payouts?)\b/i;

const clean = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const normTitle = (t: string) => t.toLowerCase().replace(/ - [^-]{2,40}$/, "").replace(/[^a-z0-9]+/g, " ").trim();

async function load(feed: Feed): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(9000),
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const $ = cheerio.load(await res.text(), { xmlMode: true });
    const out: NewsItem[] = [];
    $("item").each((_, el) => {
      const item = $(el);
      let title = clean(item.find("title").first().text());
      const url = item.find("link").first().text().trim();
      const publishedAt = Date.parse(item.find("pubDate").first().text());
      if (!title || !url || !Number.isFinite(publishedAt)) return;

      // Google News appends " - Publisher" and carries the publisher in <source>.
      let source = feed.source;
      if (feed.source === "Google News") {
        const pub = clean(item.find("source").first().text());
        if (pub) {
          source = pub;
          title = title.replace(new RegExp(`\\s+-\\s+${pub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
        }
      }

      let summary = clean(item.find("description").first().text());
      // "PSX" is also Phillips 66's NYSE ticker; the aggregator query pulls those in.
      if (feed.source === "Google News" && (/phillips 66|nyse/i.test(`${title} ${summary}`) || !/pakistan|karachi|kse|rupee|sbp|islamabad|lahore|\.pk/i.test(`${title} ${summary} ${source}`) && !/book closure/i.test(title))) return;
      if (/^https?:\/\//.test(summary) || summary.toLowerCase().startsWith(title.toLowerCase().slice(0, 30))) summary = "";
      out.push({
        id: `${publishedAt}:${normTitle(title).slice(0, 60)}`,
        title,
        url,
        source,
        publishedAt,
        summary: summary.slice(0, 240),
        announcement: ANNOUNCEMENT.test(title),
      });
    });
    return out;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(7, Math.max(1, Number(searchParams.get("days")) || 1));

  const results = await Promise.all(FEEDS.map(load));
  const reachable = results.filter(r => r.length > 0).length;
  if (reachable === 0) {
    return NextResponse.json({ success: false, error: "News sources are unreachable right now" }, { status: 502 });
  }

  // "Today" is the Pakistan calendar day (UTC+5), not a rolling 24 hours.
  const PKT = 5 * 3600_000;
  const startOfToday = Math.floor((Date.now() + PKT) / 86_400_000) * 86_400_000 - PKT;
  const since = startOfToday - (days - 1) * 86_400_000;

  const seen = new Set<string>();
  const items = results
    .flat()
    .filter(i => i.publishedAt >= since && i.publishedAt <= Date.now() + 3600_000)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter(i => {
      const k = normTitle(i.title);
      if (seen.has(k)) return false; // same story from several outlets/aggregators
      seen.add(k);
      return true;
    });

  return NextResponse.json({ success: true, data: items, fetchedAt: Date.now(), sourcesOk: reachable, sourcesTotal: FEEDS.length });
}
