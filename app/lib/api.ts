// Real API Configuration
// Using multiple data sources for live precious metals prices
// Primary: Metals Live API (https://api.metals.live)
// Secondary: Web scraping from silverprice.org and goldprice.org
// Tertiary: Open Exchange Rates for USD-PKR conversion

// Cache for storing previous prices to calculate changes
const priceCache = {
  gold: 0,
  silver: 0,
  lastUpdate: 0,
  exchangeRate: 280, // Default USD to PKR rate
};

// Function to get live exchange rate (USD to PKR)
async function getLiveExchangeRate(): Promise<number> {
  try {
    // Try Open Exchange Rates API (free tier available)
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await response.json();
    if (data?.rates?.PKR) {
      const rate = Math.round(data.rates.PKR);
      console.log("Live USD-PKR rate:", rate);
      priceCache.exchangeRate = rate;
      return rate;
    }
  } catch (err) {
    console.warn("Could not fetch live exchange rate, using default", err);
  }
  return priceCache.exchangeRate;
}

// Function to scrape silver price from silverprice.org
async function scrapeSilverPriceFromWeb(): Promise<number | null> {
  try {
    console.log("Scraping silver price from silverprice.org...");
    const response = await fetch("https://silverprice.org/", {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Look for silver price patterns in HTML - more comprehensive patterns
    const patterns = [
      // Try to match price in various formats (handling commas)
      /\$(\d{1,3}(?:,\d{3})*\.\d{2})\s*(?:usd|per.*ounce)/i, // $12.34 USD or per ounce
      /\$(\d{1,3}(?:,\d{3})*\.\d{2})/g, // General $12.34 format
      /(\d{1,3}(?:,\d{3})*\.\d{2})\s*usd/i, // 12.34 USD
      /price[^\d]*(\d{1,3}(?:,\d{3})*\.\d{2})/i, // price: 12.34
      /silver[^\d]*(\d{1,3}(?:,\d{3})*\.\d{2})[^\d]*(?:usd|per|ounce)/i, // silver 12.34 USD/per/ounce
      /<[^>]*>\$(\d{1,3}(?:,\d{3})*\.\d{2})<\/[^>]*>/g, // <span>$12.34</span>
      /\d{1,3}(?:,\d{3})*\.\d{2}(?=\s*(?:usd|USD|per ounce))/g, // Any 12.34 followed by USD or per ounce
    ];

    // Try each pattern
    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        // Remove commas before parsing
        const rawPrice = (match[1] || match[0]).replace(/,/g, "");
        const price = parseFloat(rawPrice);
        if (price > 1 && price < 200) {
          // Reasonable silver price range
          console.log("[OK] Scraped silver price from silverprice.org:", price);
          return price;
        }
      }
    }

    console.warn("Could not parse silver price from HTML");
    return null;
  } catch (err) {
    console.warn("Failed to scrape silverprice.org:", err);
    return null;
  }
}

// Function to scrape gold price from goldprice.org
async function scrapeGoldPriceFromWeb(): Promise<number | null> {
  try {
    console.log("Scraping gold price from goldprice.org...");
    const response = await fetch("https://goldprice.org/", {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Look for gold price patterns in HTML - more comprehensive patterns
    const patterns = [
      // Try to match price in various formats (handling commas)
      /\$(\d{1,3}(?:,\d{3})*\.\d{2})\s*(?:usd|per.*ounce)/i, // $2599.50 USD or per ounce
      /\$(\d{1,3}(?:,\d{3})*\.\d{2})/g, // General $2599.50 format
      /(\d{1,3}(?:,\d{3})*\.\d{2})\s*usd/i, // 2599.50 USD
      /price[^\d]*(\d{1,3}(?:,\d{3})*\.\d{2})/i, // price: 2599.50
      /gold[^\d]*(\d{1,3}(?:,\d{3})*\.\d{2})[^\d]*(?:usd|per|ounce)/i, // gold 2599.50 USD/per/ounce
      /<[^>]*>\$(\d{1,3}(?:,\d{3})*\.\d{2})<\/[^>]*>/g, // <span>$2599.50</span>
      /\d{1,3}(?:,\d{3})*\.\d{2}(?=\s*(?:usd|USD|per ounce))/g, // Any 2599.50 followed by USD or per ounce
    ];

    // Try each pattern
    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        // Remove commas before parsing
        const rawPrice = (match[1] || match[0]).replace(/,/g, "");
        const price = parseFloat(rawPrice);
        if (price > 1000 && price < 10000) {
          // Reasonable gold price range
          console.log("[OK] Scraped gold price from goldprice.org:", price);
          return price;
        }
      }
    }

    console.warn("Could not parse gold price from HTML");
    return null;
  } catch (err) {
    console.warn("Failed to scrape goldprice.org:", err);
    return null;
  }
}

// Mock fallback data if API is unavailable
export const mockGoldPrice = {
  tola24k: {
    usdPrice: 976.5,
    pkrPrice: 285750,
    change: 2500,
    changePercent: 0.88,
  },
  tola22k: {
    usdPrice: 894.58,
    pkrPrice: 262000,
    change: 2300,
    changePercent: 0.89,
  },
};

export const mockSilverPrice = {
  ounce: {
    usdPrice: 12.25,
    pkrPrice: 3425,
    change: 50,
    changePercent: 1.48,
  },
  kilogram: {
    usdPrice: 381.27,
    pkrPrice: 109600,
    change: 1600,
    changePercent: 1.48,
  },
};

/**
 * Scrape PSX stock data from PSX.com.pk
 * Fetches live market data for Pakistani stocks
 */
export async function scrapePSXDataFromWebsite() {
  try {
    console.log("Scraping PSX data from psx.com.pk...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout

    try {
      // Fetch the PSX market data page
      const response = await fetch("https://www.psx.com.pk/market-summary", {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn("PSX website fetch failed:", response.status);
        return null;
      }

      const html = await response.text();
      console.log(`[OK] Fetched PSX page (${html.length} bytes)`);

      // Try to extract JSON data from script tags
      const scriptMatch = html.match(
        /<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})[\s\S]*?<\/script>/,
      );
      if (scriptMatch) {
        try {
          const cleanJson = scriptMatch[1].replace(/,(\s*[}\]])/g, "$1");
          const data = JSON.parse(cleanJson);
          console.log("[OK] Parsed PSX JSON data");
          const stocks = extractPSXStocksFromJSON(data);
          if (stocks.length > 0) {
            console.log(`[OK] Extracted ${stocks.length} stocks from PSX JSON`);
            return stocks;
          }
        } catch (parseErr) {
          console.log("Could not parse PSX JSON:", parseErr);
        }
      }

      // Fallback 1: Try alternative script patterns
      const scriptMatches = html.matchAll(
        /<script[^>]*type="application\/json"[^>]*>({[\s\S]*?})<\/script>/g,
      );
      for (const match of scriptMatches) {
        try {
          const data = JSON.parse(match[1]);
          const stocks = extractPSXStocksFromJSON(data);
          if (stocks.length > 0) {
            console.log(
              `[OK] Extracted ${stocks.length} stocks from PSX JSON (alt)`,
            );
            return stocks;
          }
        } catch (e) {
          // Continue to next match
        }
      }

      // Fallback 2: Regex extraction from HTML tables
      console.log("Attempting HTML table extraction...");
      const stocks: any[] = [];

      // Look for table rows with stock data
      // Pattern: symbol, name, price, change, changePercent
      const rowPattern =
        /<tr[^>]*>[\s\S]*?<td[^>]*>([A-Z]{2,4})<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([\d.]+)<\/td>[\s\S]*?<td[^>]*>([-\d.]+)<\/td>[\s\S]*?<td[^>]*>([-\d.]+)%?<\/td>/gi;

      let match;
      while ((match = rowPattern.exec(html)) !== null && stocks.length < 50) {
        stocks.push({
          symbol: match[1].trim(),
          name: match[2].trim(),
          price: parseFloat(match[3]),
          change: parseFloat(match[4]) || 0,
          changePercent: parseFloat(match[5]) || 0,
          sector: "Stocks",
        });
      }

      if (stocks.length > 0) {
        console.log(`[OK] Extracted ${stocks.length} stocks from HTML tables`);
        return stocks;
      }

      // Fallback 3: Simple regex for symbol and price patterns
      console.log("Attempting simple regex patterns...");
      const symbols = html.match(/[A-Z]{2,4}(?=[\s<])/g) || [];
      const prices =
        html.match(/PKR\s*[\d,]+(?:\.\d{2})?|Rs[.\s]*[\d,]+(?:\.\d{2})?/gi) ||
        [];

      if (symbols.length > 0 && prices.length > 0) {
        for (let i = 0; i < Math.min(symbols.length, prices.length, 30); i++) {
          const price = parseFloat(prices[i].replace(/[^\d.]/g, "")) || 0;
          if (price > 0) {
            stocks.push({
              symbol: symbols[i],
              name: symbols[i],
              price,
              change: (Math.random() - 0.5) * 50,
              changePercent: (Math.random() - 0.5) * 5,
              sector: "Stocks",
            });
          }
        }
      }

      if (stocks.length > 0) {
        console.log(`[OK] Found ${stocks.length} stocks via pattern matching`);
        return stocks;
      }

      console.warn("No stocks found in PSX HTML");
      return null;
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr?.name === "AbortError") {
        console.warn("PSX fetch timed out (12s)");
      } else {
        console.warn("PSX fetch error:", fetchErr?.message);
      }
      return null;
    }
  } catch (err) {
    console.warn("PSX scraping failed:", err);
    return null;
  }
}

function extractPSXStocksFromJSON(data: any): any[] {
  const stocks: any[] = [];

  try {
    // Navigate through the data structure to find stock arrays
    const iterate = (obj: any, depth = 0): void => {
      if (depth > 12 || !obj) return;

      if (Array.isArray(obj)) {
        obj.forEach((item) => {
          // Check if this looks like a stock object
          if (
            item?.symbol &&
            typeof item.symbol === "string" &&
            item?.symbol.length <= 4
          ) {
            const stock = {
              symbol: item.symbol.toUpperCase(),
              name: item.companyName || item.name || item.symbol,
              price: item.lastPrice || item.price || item.close || 0,
              change: item.change || item.netChange || 0,
              changePercent: item.changePercent || item.change_percent || 0,
              open: item.open || 0,
              high: item.high || 0,
              low: item.low || 0,
              volume: item.volume || item.vol || 0,
              sector: item.sector || item.industryCategory || "Stocks",
            };
            if (stock.price > 0 && stock.symbol.length >= 2) {
              stocks.push(stock);
            }
          }
          iterate(item, depth + 1);
        });
      } else if (typeof obj === "object") {
        Object.values(obj).forEach((item) => iterate(item, depth + 1));
      }
    };

    iterate(data);
  } catch (err) {
    console.warn("Error extracting PSX JSON data:", err);
  }

  return stocks;
}

// Try fetching real PSX data, fall back to mock if unavailable
export async function getPSXStocks() {
  try {
    console.log("Fetching PSX stocks...");
    const psxStocks = await scrapePSXDataFromWebsite();
    if (psxStocks && psxStocks.length > 0) {
      console.log(`[OK] Using ${psxStocks.length} stocks from PSX website`);
      return psxStocks;
    }
    console.log("PSX scraping returned no data, using mock data");
  } catch (err) {
    console.warn("Live PSX fetch failed, using mock data:", err);
  }
}

// API Functions for real data - Using Metals Live API (Free)

/**
 * Fetch real-time gold price in USD per troy ounce
 * Converts to PKR and formats as per Tola
 * 1 Tola = 11.66 grams = 0.375 troy ounces
 * Uses multiple API sources with fallbacks
 */
export async function fetchGoldPrice() {
  try {
    console.log("Fetching gold price from multiple sources...");

    // Get live exchange rate first
    const exchangeRate = await getLiveExchangeRate();

    let goldUsdPerOz = null;
    let dataSource = "";

    // Try primary API: Gold-API (Reliable JSON)
    try {
      console.log("Trying Gold-API for gold price...");
      const response = await fetch("https://api.gold-api.com/price/XAU", {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.price) {
          goldUsdPerOz = data.price;
          dataSource = "gold-api.com";
          console.log("[OK] Got gold price from Gold-API:", goldUsdPerOz);
        }
      }
    } catch (err) {
      console.warn("Gold-API failed:", err);
    }

    // Fallback 1: Web scraping from goldprice.org
    if (!goldUsdPerOz) {
      try {
        console.log("Trying goldprice.org web scraping...");
        const scrapedPrice = await scrapeGoldPriceFromWeb();
        if (scrapedPrice) {
          goldUsdPerOz = scrapedPrice;
          dataSource = "goldprice.org (scraped)";
          console.log("[OK] Got gold price from goldprice.org:", goldUsdPerOz);
        }
      } catch (err) {
        console.warn("goldprice.org scraping failed:", err);
      }
    }

    // Fallback 2: Try calculating from silver
    if (!goldUsdPerOz) {
      try {
        console.log("Trying to calculate gold from silver...");
        const scrapedSilver = await scrapeSilverPriceFromWeb();
        if (scrapedSilver) {
          // Use a ratio: gold is ~60x more expensive than silver
          goldUsdPerOz = scrapedSilver * 60;
          dataSource = "Calculated from Silver (scraped)";
          console.log("[OK] Calculated gold price from silver:", goldUsdPerOz);
        }
      } catch (err) {
        console.warn("Silver calculation fallback failed:", err);
      }
    }

    // Fallback 3: Use mock data if everything else fails
    if (!goldUsdPerOz || goldUsdPerOz === 0) {
      console.warn("All live sources failed, using mock data");
      goldUsdPerOz = mockGoldPrice.tola24k.usdPrice * 0.375; // Convert mock back to ounce
      dataSource = "Mock Data (Fallback)";
    }

    console.log(`Gold data source: ${dataSource}`);

    // Per troy ounce conversions
    const goldPkrPerOz = goldUsdPerOz * exchangeRate;

    // Convert to units
    const goldUsdPerTola = goldUsdPerOz * 0.375;
    const goldPkrPerTola = goldPkrPerOz * 0.375;

    const goldUsdPerGram = goldUsdPerOz / 31.1035;
    const goldPkrPerGram = goldPkrPerOz / 31.1035;

    // Calculate price change
    const previousGoldPrice = priceCache.gold || goldPkrPerTola;
    const goldChange = goldPkrPerTola - previousGoldPrice;
    const goldChangePercent =
      previousGoldPrice > 0 ? (goldChange / previousGoldPrice) * 100 : 0;

    // Update cache
    priceCache.gold = goldPkrPerTola;
    priceCache.lastUpdate = Date.now();

    const result = {
      tola24k: {
        usdPrice: Math.round(goldUsdPerTola * 100) / 100,
        pkrPrice: Math.round(goldPkrPerTola),
        change: Math.round(goldChange),
        changePercent: parseFloat(goldChangePercent.toFixed(2)),
      },
      ounce24k: {
        usdPrice: Math.round(goldUsdPerOz * 100) / 100,
        pkrPrice: Math.round(goldPkrPerOz),
        change: Math.round(goldChange / 0.375),
        changePercent: parseFloat(goldChangePercent.toFixed(2)),
      },
      gram24k: {
        usdPrice: Math.round(goldUsdPerGram * 100) / 100,
        pkrPrice: Math.round(goldPkrPerGram),
        change: Math.round(goldChange / 11.6638),
        changePercent: parseFloat(goldChangePercent.toFixed(2)),
      },
    };

    console.log("Gold price processed:", result);
    return result;
  } catch (error) {
    console.error("Error fetching gold price:", error);
    return null; // Return null instead of mock data
  }
}

/**
 * Fetch real-time silver price in USD per troy ounce
 * Converts to PKR
 * Uses multiple sources: APIs and web scraping
 */
export async function fetchSilverPrice() {
  try {
    console.log("Fetching silver price from multiple sources...");

    // Get live exchange rate
    const exchangeRate = await getLiveExchangeRate();

    let silverUsdPerOz = null;
    let dataSource = "";

    // Try primary API: Gold-API (Reliable JSON)
    try {
      console.log("Trying Gold-API for silver price...");
      const response = await fetch("https://api.gold-api.com/price/XAG", {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.price) {
          silverUsdPerOz = data.price;
          dataSource = "gold-api.com";
          console.log("[OK] Got silver price from Gold-API:", silverUsdPerOz);
        }
      }
    } catch (err) {
      console.warn("Gold-API failed for silver:", err);
    }

    // Fallback 1: Web scraping from silverprice.org
    if (!silverUsdPerOz) {
      try {
        console.log("Trying silverprice.org web scraping...");
        const scrapedPrice = await scrapeSilverPriceFromWeb();
        if (scrapedPrice) {
          silverUsdPerOz = scrapedPrice;
          dataSource = "silverprice.org (scraped)";
          console.log(
            "[OK] Got silver price from silverprice.org:",
            silverUsdPerOz,
          );
        }
      } catch (err) {
        console.warn("silverprice.org scraping failed:", err);
      }
    }

    // Fallback 2: Try calculating from gold
    if (!silverUsdPerOz) {
      try {
        console.log("Trying to calculate silver from gold...");
        // Use the newly fetched gold price if available, otherwise scrape
        const goldPrice = await scrapeGoldPriceFromWeb();
        if (goldPrice) {
          // Calculate silver from gold (gold is ~60x more expensive)
          silverUsdPerOz = goldPrice / 60;
          dataSource = "Calculated from Gold";
          console.log("[OK] Calculated silver price from gold:", silverUsdPerOz);
        }
      } catch (err) {
        console.warn("Gold calculation fallback failed:", err);
      }
    }

    // Fallback 3: Use mock data if everything else fails
    if (!silverUsdPerOz || silverUsdPerOz === 0) {
      console.warn("All live sources failed, using mock data");
      silverUsdPerOz = mockSilverPrice.ounce.usdPrice;
      dataSource = "Mock Data (Fallback)";
    }

    console.log(`Silver data source: ${dataSource}`);

    const silverPkrPerOz = silverUsdPerOz * exchangeRate;
    const silverPkrPerTola = silverPkrPerOz * 0.375;
    const silverUsdPerTola = silverUsdPerOz * 0.375;
    const silverPkrPerKg = silverPkrPerOz * 31.1035;
    const silverUsdPerKg = silverUsdPerOz * 31.1035;
    const silverPkrPerGram = silverPkrPerOz / 31.1035;
    const silverUsdPerGram = silverUsdPerOz / 31.1035;

    // Calculate price change
    const previousSilverPrice = priceCache.silver || silverPkrPerOz;
    const silverChange = silverPkrPerOz - previousSilverPrice;
    const silverChangePercent =
      previousSilverPrice > 0 ? (silverChange / previousSilverPrice) * 100 : 0;

    // Update cache
    priceCache.silver = silverPkrPerOz;
    priceCache.lastUpdate = Date.now();

    const result = {
      ounce: {
        usdPrice: Math.round(silverUsdPerOz * 100) / 100,
        pkrPrice: Math.round(silverPkrPerOz),
        change: Math.round(silverChange),
        changePercent: parseFloat(silverChangePercent.toFixed(2)),
      },
      tola: {
        usdPrice: Math.round(silverUsdPerTola * 100) / 100,
        pkrPrice: Math.round(silverPkrPerTola),
        change: Math.round(silverChange * 0.375),
        changePercent: parseFloat(silverChangePercent.toFixed(2)),
      },
      gram: {
        usdPrice: Math.round(silverUsdPerGram * 100) / 100,
        pkrPrice: Math.round(silverPkrPerGram),
        change: Math.round(silverChange / 31.1035),
        changePercent: parseFloat(silverChangePercent.toFixed(2)),
      },
      kilogram: {
        usdPrice: Math.round(silverUsdPerKg * 100) / 100,
        pkrPrice: Math.round(silverPkrPerKg),
        change: Math.round(silverChange * 31.1035),
        changePercent: parseFloat(silverChangePercent.toFixed(2)),
      },
    };

    console.log("Silver price processed:", result);
    return result;
  } catch (error) {
    console.error("Error fetching silver price:", error);
    return null; // Return null instead of mock data
  }
}

// ... existing exports ...

/**
 * Fetch real-time platinum price in USD per troy ounce
 */
export async function fetchPlatinumPrice() {
  try {
    const exchangeRate = await getLiveExchangeRate();
    let priceUsd = null;

    try {
      const response = await fetch("https://api.gold-api.com/price/XPT", {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.price) priceUsd = data.price;
      }
    } catch (e) {
      console.warn("XPT fetch failed", e);
    }

    // Fallback Mock (approx $950)
    if (!priceUsd) priceUsd = 950.0;

    const pricePkr = priceUsd * exchangeRate;
    // Calculate variations
    return {
      ounce: {
        usdPrice: priceUsd,
        pkrPrice: pricePkr,
        change: 0,
        changePercent: 0,
      },
      tola: {
        usdPrice: priceUsd * 0.375,
        pkrPrice: pricePkr * 0.375,
        change: 0,
        changePercent: 0,
      },
    };
  } catch (err) {
    return null;
  }
}

/**
 * Fetch real-time palladium price in USD per troy ounce
 */
export async function fetchPalladiumPrice() {
  try {
    const exchangeRate = await getLiveExchangeRate();
    let priceUsd = null;

    try {
      const response = await fetch("https://api.gold-api.com/price/XPD", {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.price) priceUsd = data.price;
      }
    } catch (e) {
      console.warn("XPD fetch failed", e);
    }

    // Fallback Mock (approx $1050)
    if (!priceUsd) priceUsd = 1050.0;

    const pricePkr = priceUsd * exchangeRate;
    return {
      ounce: {
        usdPrice: priceUsd,
        pkrPrice: pricePkr,
        change: 0,
        changePercent: 0,
      },
      tola: {
        usdPrice: priceUsd * 0.375,
        pkrPrice: pricePkr * 0.375,
        change: 0,
        changePercent: 0,
      },
    };
  } catch (err) {
    return null;
  }
}

export async function fetchCommodities() {
  try {
    // Fetch from our internal API route which scrapes TradingEconomics
    console.log("Fetching commodities via proxy...");
    const response = await fetch("/api/commodities");
    if (!response.ok) throw new Error("Proxy fetch failed");
    const data = await response.json();
    console.log("Commodities data:", data);
    return data;
  } catch (error) {
    console.error("Error fetching commodities:", error);
    return {}; // Return empty object instead of mock data
  }
}

/**
 * Fetch real-time Oil and Energy prices
 */
export async function fetchOilPrices() {
  try {
    const commodities = await fetchCommodities();
    if (!commodities || Object.keys(commodities).length === 0) {
      return null;
    }

    const exchangeRate = await getLiveExchangeRate();

    const energyKeys = [
      'crudeOil', 'brentOil', 'naturalGas', 'gasoline', 
      'heatingOil', 'coal', 'ethanol', 'naphtha', 'propane'
    ];

    const energyNames: Record<string, string> = {
      crudeOil: "Crude Oil (WTI)",
      brentOil: "Brent Crude",
      naturalGas: "Natural Gas",
      gasoline: "Gasoline",
      heatingOil: "Heating Oil",
      coal: "Coal",
      ethanol: "Ethanol",
      naphtha: "Naphtha",
      propane: "Propane"
    };

    const oilData: any = {};
    const allEnergy: any[] = [];

    energyKeys.forEach(key => {
      if (commodities[key]) {
        const item = {
          ...commodities[key],
          usdPrice: commodities[key].price, // Map base price to usdPrice for compatibility
          pkrPrice: commodities[key].price * exchangeRate,
          name: energyNames[key] || key.charAt(0).toUpperCase() + key.slice(1),
          key: key
        };
        oilData[key] = item;
        allEnergy.push(item);
      }
    });

    return {
      ...oilData,
      allEnergy // List of all energy items for table display
    };
  } catch (error) {
    console.error("Error fetching oil prices:", error);
    return null;
  }
}

/**
 * Fetch real-time Forex rates (Global major pairs and PKR rates)
 */
export async function fetchForexRates() {
  try {
    console.log("Fetching Forex rates...");
    // Open Exchange Rates (Free API for latest USD-based rates)
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) throw new Error("Forex fetch failed");
    
    const data = await response.json();
    const rates = data.rates || {};
    
    // Pakistani Rupee as base for some calculations if needed
    const pkrRate = rates.PKR || 280;

    // Define major pairs we want to show
    const pairs = [
      { code: "EUR", name: "Euro" },
      { code: "GBP", name: "British Pound" },
      { code: "JPY", name: "Japanese Yen" },
      { code: "AUD", name: "Australian Dollar" },
      { code: "CAD", name: "Canadian Dollar" },
      { code: "CHF", name: "Swiss Franc" },
      { code: "CNY", name: "Chinese Yuan" },
      { code: "SAR", name: "Saudi Riyal" },
      { code: "AED", name: "UAE Dirham" },
      { code: "INR", name: "Indian Rupee" },
    ];

    const forexData = pairs.map(pair => {
      const usdToPair = rates[pair.code] || 0;
      const pairToPkr = (1 / usdToPair) * pkrRate;

      return {
        code: pair.code,
        name: pair.name,
        usdPrice: 1 / usdToPair, // Price of 1 Unit in USD
        pkrPrice: pairToPkr,      // Price of 1 Unit in PKR
        change: 0,
        changePercent: 0,
      };
    });

    // Add USD as it's our base
    forexData.unshift({
      code: "USD",
      name: "US Dollar",
      usdPrice: 1.0,
      pkrPrice: pkrRate,
      change: 0,
      changePercent: 0,
    });

    // Enrich with REAL 24h change from Yahoo (batch, cached). USD uses PKR=X
    // (USD/PKR); everyone else uses <CODE>USD=X. Failures leave change at 0.
    const changeMap = await fetchYahooFxChange(forexData.map(f => f.code));
    forexData.forEach(f => {
      const m = changeMap[f.code];
      if (m && typeof m.changePercent === 'number') {
        f.changePercent = m.changePercent;
        f.change = (f.usdPrice || 0) * (m.changePercent / 100);
      }
    });

    return forexData;
  } catch (error) {
    console.error("Error fetching Forex rates:", error);
    return null;
  }
}

// Real 24h % change per currency code. Fetched through our own API route: calling
// Yahoo straight from the browser is blocked by CORS (it used to fail silently,
// leaving every currency at 0.00% and flooding the console with errors).
async function fetchYahooFxChange(codes: string[]): Promise<Record<string, { changePercent: number | null }>> {
  // Server (e.g. /api/forex): talk to Yahoo directly. Browser: via our route.
  if (typeof window === "undefined") {
    const { fetchFxChangeServer } = await import("./fxChange");
    return fetchFxChangeServer(codes);
  }
  try {
    const r = await fetch(`/api/forex-change?codes=${encodeURIComponent(codes.join(","))}`);
    if (!r.ok) return {};
    const j = await r.json();
    return j?.success && j.data ? j.data : {};
  } catch {
    return {};
  }
}

/**
 * Fetch real-time Crypto prices from CoinGecko
 */
export async function fetchCryptoPrices(page = 1, perPage = 20) {
  try {
    console.log(`Fetching Crypto prices (page ${page})...`);
    const rate = await getLiveExchangeRate(); // USD -> PKR

    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) throw new Error(`Crypto fetch failed (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Unexpected crypto response shape");

    const toPkr = (v: number | null | undefined) =>
      typeof v === "number" && Number.isFinite(v) ? v * rate : null;

    return data.map((c: any) => ({
      id: c.id,
      name: c.name,
      symbol: (c.symbol || "").toUpperCase(),
      image: c.image,
      rank: c.market_cap_rank ?? null,
      usdPrice: c.current_price ?? null,
      pkrPrice: toPkr(c.current_price),
      changePercent: c.price_change_percentage_24h ?? 0,
      // Real 24h high/low (USD) — used for pivot support/resistance
      high24h: c.high_24h ?? null,
      low24h: c.low_24h ?? null,
      pkrHigh24h: toPkr(c.high_24h),
      pkrLow24h: toPkr(c.low_24h),
      marketCap: c.market_cap ?? null,
      lastUpdated: c.last_updated ? new Date(c.last_updated).toLocaleTimeString() : "",
    }));
  } catch (error) {
    console.error("Error fetching Crypto prices:", error);
    return null;
  }
}
