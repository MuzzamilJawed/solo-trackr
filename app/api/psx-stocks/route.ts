import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

async function fetchMarketSummary(): Promise<NextResponse> {
  try {
    // We use the main PSX website for market summary
    const response = await fetch('https://www.psx.com.pk/market-summary', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`PSX fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const stocks: any[] = [];
    const indices: any[] = [];

    // Extract Indices - More robust way as they might not be in a table
    // Look for common index names in the text or specific structures
    const indexData: any[] = [];
    
    // Method 1: Check for the new ticker/slider format seen in recent PSX updates
    $('.indices-ticker .item, .index-box').each((_, el) => {
      const name = $(el).find('.name, h3').text().trim();
      const value = parseFloat($(el).find('.value, h4').text().replace(/,/g, ''));
      const change = parseFloat($(el).find('.change, h5').text().replace(/,/g, ''));
      if (name && !isNaN(value)) {
        indexData.push({ name, value, change });
      }
    });

    // Method 2: Fallback to the first table if ticker not found
    if (indexData.length === 0) {
      const indexTable = $('table').eq(0);
      indexTable.find('tr').each((i, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 6) {
          const name = tds.eq(0).text().trim();
          const price = parseFloat(tds.eq(4).text().replace(/,/g, ''));
          const change = parseFloat(tds.eq(5).text().replace(/,/g, ''));
          if (name && !isNaN(price)) {
            indexData.push({ name, value: price, change });
          }
        }
      });
    }

    // Extract Market Status & Stats (Volume, Value, Trades etc.)
    // Interface for type safety
    interface MarketStats {
      status: string;
      volume: string;
      value: string;
      trades: string;
      advanced: number;
      declined: number;
      unchanged: number;
      total: number;
      [key: string]: any;
    }

    const stats: MarketStats = { 
      status: "Unknown", 
      volume: "0", 
      value: "0", 
      trades: "0", 
      advanced: 0, 
      declined: 0, 
      unchanged: 0, 
      total: 0 
    };

    // SEMANTIC DEEP SCAN: Search for labels and greedy extract values
    let summaryFound = false;
    $('table tr').each((i, tr) => {
        if (summaryFound && i > 20) return; // Only scan the first 20 rows of the page for global stats
        
        const cells = $(tr).find('td, th');
        const rowText = $(tr).text();

        // Pass 1: Handle Merged or Paired Stats (Volume, Value, Trades, Breadth)
        cells.each((j, cell) => {
            const text = $(cell).text().trim();
            const nextText = cells.eq(j + 1).text().trim();
            
            // Define mapping for stats with stricter matching for "Value"
            const mappings: any = {
                'Status': 'status', 
                'Volume': 'volume', 
                'Value': 'value', 
                'Trades': 'trades',
                'Advanced': 'advanced', 
                'Declined': 'declined', 
                'Unchanged': 'unchanged'
            };

            Object.entries(mappings).forEach(([label, key]) => {
                const statsKey = key as string;
                if (text.startsWith(label) || (text.includes(label) && text.length < 15)) {
                    // Try to extract from current cell (if merged like "Volume: 123") or next cell
                    let val = text.includes(':') ? text.split(':')[1]?.trim() : nextText;
                    if (val && val.length > 0) {
                        if (['advanced', 'declined', 'unchanged'].includes(statsKey)) {
                            stats[statsKey] = parseInt(val.replace(/,/g, '')) || 0;
                        } else {
                            // If we already have a high-confidence value, don't overwrite with smaller ones
                            if (statsKey === 'value' && stats.value !== "0" && val.length < (stats.value as string).length) return;
                            stats[statsKey] = val;
                        }
                        if (statsKey === 'status' || statsKey === 'volume') summaryFound = true;
                    }
                }
            });
        });

        // Pass 2: Handle Indices Row (Complex multi-value cells)
        if (rowText.includes('Indices')) {
            cells.each((j, cell) => {
                const content = $(cell).text().trim().replace(/\s+/g, ' ');
                // Precise match for Index Name, Value (Points), and Change
                const indexMatch = content.match(/([A-Z0-9\-]{3,})\s+([\d\.,]{4,})\s+([\-\+\d\.,]+)/i);
                if (indexMatch) {
                    const name = indexMatch[1].toUpperCase();
                    const val1 = parseFloat(indexMatch[2].replace(/,/g, ''));
                    const val2 = parseFloat(indexMatch[3].replace(/,/g, ''));
                    
                    // On PSX, Value is usually thousands (60,000+) and Change is double/triple digits
                    const value = Math.max(val1, val2);
                    const change = Math.min(val1, val2);
                    
                    if (!isNaN(value) && !indexData.find(d => d.name === name)) {
                        indexData.push({ name, value, change });
                    }
                }
            });
        }
    });

    // Strategy 3: Global Text Scan (Last resort for missed indices)
    if (indexData.length < 3) {
        const fullText = $('body').text().replace(/\s+/g, ' ');
        const tracked = ['KSE100', 'KSE30', 'KMI30', 'KMIALL', 'BKTI', 'OGTI', 'ALLSHR'];
        tracked.forEach(t => {
            if (!indexData.find(d => d.name.includes(t))) {
                // Look for: NAME [Value(e.g 60,123)] [Change(e.g +60.16)]
                const regex = new RegExp(`${t}\\s+([\\d\\.,]{4,})\\s+([\\-\\+\\d\\.,]+)`, 'i');
                const match = fullText.match(regex);
                if (match) {
                    indexData.push({ name: t, value: parseFloat(match[1].replace(/,/g, '')), change: parseFloat(match[2].replace(/,/g, '')) });
                }
            }
        });
    }

    // Final Cleanup & Normalization
    indexData.forEach(idx => {
      const name = idx.name.toUpperCase();
      const trackedIndices = ['KSE100', 'KSE30', 'KMI30', 'KMIALL', 'KMI-ALL', 'ALLSHR', 'ALL SHARES', 'ALL SHARES', 'BKTI', 'OGTI'];
      const matches = trackedIndices.find(t => name.includes(t));
      
      if (matches) {
        let displayName = matches;
        if (matches === 'KMIALL' || matches === 'KMI-ALL') displayName = 'KMIALLSHR';
        if (matches === 'ALL SHARES' || matches === 'ALL SHARES') displayName = 'ALLSHR';
        
        if (!indices.find(i => i.name === displayName)) {
          indices.push({
            name: displayName,
            value: idx.value,
            change: idx.change || 0,
            changePercent: (idx.value - idx.change !== 0) ? (idx.change / (idx.value - idx.change)) * 100 : 0
          });
        }
      }
    });

    // Post-Process Stats to fix the "60.16" error (likely was an index change)
    if (stats.value && stats.value.length < 8 && !stats.value.toLowerCase().includes('bn')) {
        // If "Value" is dangerously low (like 60.16), it might be an index change caught by accident
        // We'll reset it to "Scanning..." or look for a larger number in the summary text
        const summaryText = $('body').text();
        const valueRegex = /Value\s*\(Rs\.\)\s*:\s*([\d\.,\s]+[MBbTt]?n?)/i;
        const betterMatch = summaryText.match(valueRegex);
        if (betterMatch) stats.value = betterMatch[1].trim();
    }

    // PSX doesn't publish a "total scrips traded" figure, and `total` was left at
    // its 0 initialiser — so the UI's Total chip always read 0. It's just the
    // three buckets added up.
    stats.total = (Number(stats.advanced) || 0) + (Number(stats.declined) || 0) + (Number(stats.unchanged) || 0);

    // PSX Market Summary has multiple tables, one for each sector
    $('table').each((ti, table) => {
      // Find rows in this table
      const rows = $(table).find('tr');
      if (rows.length < 2) return;

      // Try to find the sector name
      let sector = "Other";
      
      // Method 1: Check if the first row is a sector header (spans multiple columns)
      const firstRow = rows.eq(0);
      const firstRowCells = firstRow.find('td, th');
      if (firstRowCells.length === 1 || (firstRowCells.length < 3 && firstRowCells.first().attr('colspan'))) {
        sector = firstRowCells.text().trim().replace(/\s+/g, ' ');
      } else {
        // Method 2: Check for a heading (h4 or similar) before the table
        const heading = $(table).prevAll('h4, h3, .sector-title, .table-title, .section-header').first();
        if (heading.length) {
          sector = heading.text().trim();
        } else {
            // Method 3: Check for data-sector attribute on the table itself
            sector = $(table).attr('data-sector') || "Market Scrips";
        }
      }

      // Skip sections that define futures or summary info if they are caught as "sectors"
      const sectorLower = sector.toLowerCase();
      if (sectorLower.includes('future') || sectorLower.includes('summary') || sectorLower.includes('indices') || sectorLower === 'scrip') {
        return;
      }

      rows.each((ri, tr) => {
        const tds = $(tr).find('td');
        // PSX data rows typically: SCRIP | LDCP | OPEN | HIGH | LOW | CURRENT | CHANGE | VOLUME
        // Some tables might have slightly different count, but symbol and price are key
        if (tds.length < 5) return;

        const firstTd = tds.eq(0);
        const rawName = firstTd.text().trim();
        
        // Skip header rows within the table body
        if (!rawName || rawName === "SCRIP" || rawName === "SYMBOL" || rawName.includes("Advanced:") || rawName.includes("Declined:") || rawName === sector) return;

        // Extract real symbol from attributes if available
        let symbol = firstTd.attr('data-symbol') || firstTd.attr('data-srip') || rawName;
        
        // FILTER: Skip futures (symbol often has -FEB, -MAR etc.)
        const isFuture = /-[A-Z]{3}$/.test(symbol);
        if (isFuture) return;

        const ldcpValue = tds.eq(1).text().replace(/,/g, '');
        const ldcp = parseFloat(ldcpValue);
        const price = parseFloat(tds.eq(5).text().replace(/,/g, ''));
        const change = parseFloat(tds.eq(6).text().replace(/,/g, ''));
        const volume = tds.eq(7).text().trim();

        // Valid data check
        if (!isNaN(price)) {
          stocks.push({
            symbol: symbol,
            name: rawName,
            currentPrice: price,
            // Last Day Closing Price — the basis PSX applies its daily circuit
            // breaker to, so the client can show exact upper/lower lock levels.
            ldcp: isNaN(ldcp) ? null : ldcp,
            change: isNaN(change) ? 0 : change,
            changePercent: (ldcp > 0 && !isNaN(change)) ? (change / ldcp) * 100 : 0,
            open: parseFloat(tds.eq(2).text().replace(/,/g, '')) || 0,
            high: parseFloat(tds.eq(3).text().replace(/,/g, '')) || 0,
            low: parseFloat(tds.eq(4).text().replace(/,/g, '')) || 0,
            volume: volume || '0',
            sector: sector
          });
        }
      });
    });

    return NextResponse.json({ 
      data: stocks.slice(0, 800),
      indices: indices,
      stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('PSX scraping error:', error);
    
    // Return mock data as fallback
    const mockStocks = [
      { symbol: 'HBL', name: 'Habib Bank Ltd', currentPrice: 85.50, change: 2.10, changePercent: 2.52, open: 83.40, high: 86.20, low: 83.00, volume: '15.2M', sector: 'Banks' },
      { symbol: 'MCB', name: 'MCB Bank Ltd', currentPrice: 265.75, change: -4.25, changePercent: -1.57, open: 270.00, high: 271.50, low: 265.00, volume: '8.5M', sector: 'Banks' },
      { symbol: 'NBP', name: 'National Bank of Pakistan', currentPrice: 65.30, change: 1.80, changePercent: 2.83, open: 63.50, high: 66.00, low: 63.25, volume: '22.1M', sector: 'Banks' },
      { symbol: 'ENGRO', name: 'Engro Corp Ltd', currentPrice: 425.00, change: 8.50, changePercent: 2.04, open: 416.50, high: 428.75, low: 415.00, volume: '3.2M', sector: 'Chemicals' },
      { symbol: 'LUCK', name: 'Lucky Cement Ltd', currentPrice: 625.50, change: -12.50, changePercent: -1.96, open: 638.00, high: 642.00, low: 620.00, volume: '4.8M', sector: 'Cement' },
      { symbol: 'PPL', name: 'Pakistan Petroleum Ltd', currentPrice: 175.25, change: 3.75, changePercent: 2.19, open: 171.50, high: 176.50, low: 170.00, volume: '6.3M', sector: 'Oil & Gas' }
    ];

    const mockIndices = [
      { name: 'KSE100', value: 65000, change: 450, changePercent: 0.7 },
      { name: 'KSE30', value: 22000, change: 120, changePercent: 0.55 },
      { name: 'ALLSHR', value: 43000, change: 210, changePercent: 0.49 }
    ];
    
    return NextResponse.json({ 
      data: mockStocks,
      indices: mockIndices,
      stats: {},
      timestamp: new Date().toISOString(),
      note: 'Using mock data due to scraping error'
    });
  }
}

// The scrape above takes ~5 s. Several callers hit it at once on every page (dashboard,
// command palette, holding notifier, news matching), so keep the last good answer for
// 20 s and share one in-flight request. Fallback/mock responses are never cached.
let cached: { at: number; body: unknown } | null = null;
let inflight: Promise<NextResponse> | null = null;
const TTL_MS = 20_000;

export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) return NextResponse.json(cached.body);
  if (!inflight) {
    inflight = fetchMarketSummary()
      .then(async (res) => {
        try {
          const body = await res.clone().json();
          if (res.ok && Array.isArray(body?.data) && body.data.length > 20 && !body.note) cached = { at: Date.now(), body };
        } catch { /* leave the cache alone */ }
        return res;
      })
      .finally(() => { inflight = null; });
  }
  return (await inflight).clone();
}
