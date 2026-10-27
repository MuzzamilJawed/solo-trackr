// Client side of the PSX news feed: fetching, matching headlines to stocks, and
// the "seen" bookkeeping used for holding notifications.

import { cleanPsxName } from "./psxName";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  summary: string;
  announcement: boolean;
}

export async function fetchNews(days = 1): Promise<{ items: NewsItem[]; failed: boolean; fetchedAt: number | null }> {
  try {
    const res = await fetch(`/api/psx-news?days=${days}`, { cache: "no-store" });
    const json = await res.json();
    if (json?.success && Array.isArray(json.data)) return { items: json.data, failed: false, fetchedAt: json.fetchedAt ?? Date.now() };
    return { items: [], failed: true, fetchedAt: null };
  } catch {
    return { items: [], failed: true, fetchedAt: null };
  }
}

export interface StockRef { symbol: string; name?: string }

const STOP = new Set(["the", "limited", "ltd", "company", "co", "corporation", "corp", "pakistan", "pvt", "private", "of", "and", "&", "plc", "inc"]);

// "The Hub Power Company Limited" -> "hub power"; null when too generic to match on.
const nameKey = (rawName?: string): string | null => {
  const name = cleanPsxName(rawName);
  if (!name) return null;
  const words = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(w => w && !STOP.has(w));
  const key = words.slice(0, 2).join(" ");
  // Short generic pairs ("oil gas") would tag half the energy headlines.
  return key.length >= 8 ? key : null;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Symbols from `stocks` that a headline is about: the ticker as a whole word in
 * capitals (HUBC), or the company's distinctive name ("Hub Power"). Short
 * tickers (< 3 chars) are ignored — too many false hits.
 */
export function matchSymbols(item: Pick<NewsItem, "title" | "summary">, stocks: StockRef[]): string[] {
  const text = `${item.title} ${item.summary}`;
  const lower = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const hits: string[] = [];
  for (const s of stocks) {
    const sym = s.symbol.toUpperCase();
    let hit = sym.length >= 3 && new RegExp(`(^|[^A-Za-z0-9])${esc(sym)}($|[^A-Za-z0-9])`).test(text);
    if (!hit) {
      const key = nameKey(s.name);
      hit = !!key && lower.includes(key);
    }
    if (hit) hits.push(sym);
  }
  return hits;
}

export function timeAgo(ms: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// ── "Seen" ids so a headline notifies once, not on every visit ───────────────

const SEEN_KEY = "news.seen.v1";

export function loadSeen(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

export function saveSeen(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-400)));
  } catch {
    /* private mode */
  }
}
