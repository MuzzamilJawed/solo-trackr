"use client";

import { Gem, AlertTriangle, Award, Circle, X } from "lucide-react";

import MetalStatCard from "../components/MetalStatCard";
import PageSkeleton from "../components/PageSkeleton";
import { usePullRefresh } from "../lib/pullRefresh";
import { useState, useEffect, useCallback } from "react";
import { useSettings } from "../context/SettingsContext";
import { useCurrency } from "../context/CurrencyContext";
import CurrencyToggle from "../components/CurrencyToggle";
import FitText from "../components/FitText";
import FreshnessBadge from "../components/FreshnessBadge";
import { rateOf } from "../lib/currency";
// Use internal API routes to avoid CORS and run scraping/server code server-side

// ── Gold purity ─────────────────────────────────────────────────────────────
// Karat is parts-of-24 pure gold: 24K is ~100%, 18K is 18/24 = 75%. The presets
// are the grades traded most often (Pakistani and Gulf jewellery is usually 21K
// or 22K, Western 18K/14K/9K); the calculator also accepts any other value.
const KARAT_PRESETS = [24, 23, 22, 21, 20, 18, 14, 10, 9];
const CUSTOM_KARAT = 'CUSTOM';

/** Karat as a purity percentage, e.g. 21 → "87.5". */
const purityPct = (karat: number) =>
  Number(((karat / 24) * 100).toFixed(1)).toString();

/** A usable karat from free text — anything outside 1–24 is meaningless. */
const clampKarat = (raw: string) => {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 24;
  return Math.min(24, Math.max(0.1, Math.round(n * 10) / 10));
};

export default function MetalsPage() {
  const [showMore, setShowMore] = useState(false);
  const [showPurity, setShowPurity] = useState(false);
  const [calcMetal, setCalcMetal] = useState('gold');
  const [calcPurity, setCalcPurity] = useState('24K');
  const [customKarat, setCustomKarat] = useState('20');
  const [calcUnit, setCalcUnit] = useState('Tola');
  const [calcQuantity, setCalcQuantity] = useState(1);
  const [timeframe, setTimeframe] = useState("1d");
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [error, setError] = useState("");
  const [caratPrices, setCaratPrices] = useState<any[]>([]);
  const [goldCandles, setGoldCandles] = useState<any[]>([]);
  const [silverCandles, setSilverCandles] = useState<any[]>([]);
  const [goldRaw, setGoldRaw] = useState<any>(null);     // raw USD/oz history from Yahoo
  const [silverRaw, setSilverRaw] = useState<any>(null);
  const [gold52w, setGold52w] = useState<{ low: number | null; high: number | null }>({ low: null, high: null });   // PKR / tola
  const [silver52w, setSilver52w] = useState<{ low: number | null; high: number | null }>({ low: null, high: null }); // PKR / oz
  const [goldChartTF, setGoldChartTF] = useState("1D");
  const [silverChartTF, setSilverChartTF] = useState("1D");

  const { settings } = useSettings();
  const { currency: tableCurrency, sym, rates: fxRates, conv, convertFrom } = useCurrency();
  const [detailedRates, setDetailedRates] = useState<any[]>([]);
  const [rawMarketData, setRawMarketData] = useState<any>(null);
  const [purityUnit, setPurityUnit] = useState('Tola'); // 'Tola' | 'Gram' | 'Ounce' | 'Kg'

  const loadPrices = useCallback(async (isManual = true) => {
    try {
      if (isManual) setLoading(true);
      setError("");
      const [goldRes, silverRes, platinumRes, palladiumRes, commoditiesRes] = await Promise.all([
        fetch('/api/gold-price'),
        fetch('/api/silver-price'),
        fetch('/api/platinum-price'),
        fetch('/api/palladium-price'),
        fetch('/api/commodities'),
      ]);

      const gold = goldRes.ok ? await goldRes.json() : null;
      const silver = silverRes.ok ? await silverRes.json() : null;
      const platinum = platinumRes.ok ? await platinumRes.json() : null;
      const palladium = palladiumRes.ok ? await palladiumRes.json() : null;
      const commodities = commoditiesRes.ok ? await commoditiesRes.json() : null;

      // Check if we got valid data
      const hasValidData =
        (gold?.tola24k?.pkrPrice && gold.tola24k.pkrPrice > 0) ||
        (silver?.ounce?.pkrPrice && silver.ounce.pkrPrice > 0);

      if (!hasValidData) {
        setRefreshFailed(true);
        if (isManual) setError("Could not fetch price data from all sources");
      }

      // Update Carat Prices
      if (gold?.tola24k?.pkrPrice) {
        const basePrice24k = gold.tola24k.pkrPrice;
        const baseUsd24k = gold.tola24k.usdPrice;
        const change24k = gold.tola24k.change;
        const changePercent24k = gold.tola24k.changePercent;

        setCaratPrices([
          { carat: "24K", purity: 99.9, pkr: basePrice24k, usd: baseUsd24k, change: change24k, percent: changePercent24k },
          { carat: "22K", purity: 91.7, pkr: Math.round(basePrice24k * 0.916), usd: Math.round(baseUsd24k * 0.916 * 100) / 100, change: Math.round(change24k * 0.916), percent: changePercent24k },
          { carat: "21K", purity: 87.5, pkr: Math.round(basePrice24k * 0.875), usd: Math.round(baseUsd24k * 0.875 * 100) / 100, change: Math.round(change24k * 0.875), percent: changePercent24k },
          { carat: "18K", purity: 75.0, pkr: Math.round(basePrice24k * 0.75), usd: Math.round(baseUsd24k * 0.75 * 100) / 100, change: Math.round(change24k * 0.75), percent: changePercent24k },
          { carat: "12K", purity: 50, pkr: Math.round(basePrice24k * 0.5), usd: Math.round(baseUsd24k * 0.5 * 100) / 100, change: Math.round(change24k * 0.5), percent: changePercent24k },
        ]);
      }

      if (gold && silver) {
        console.log('[Metals] Fetched Gold Price:', gold?.tola24k?.pkrPrice, 'PKR / Tola');
        console.log('[Metals] Fetched Silver Price:', silver?.ounce?.pkrPrice, 'PKR / Oz');
        setRawMarketData({ gold, silver, platinum, palladium, commodities });
        if (hasValidData) {
          setFetchedAt(Date.now());
          setRefreshFailed(false);
        }
      }

    } catch (err) {
      console.error("Failed to fetch prices:", err);
      setRefreshFailed(true);
      if (isManual) setError("An error occurred while fetching data.");
    } finally {
      if (isManual) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrices(true);
  }, [loadPrices]);

  usePullRefresh(() => loadPrices(false));

  useEffect(() => {
    if (!settings.refreshInterval || settings.refreshInterval <= 0) return;

    const intervalRef = setInterval(() => {
      loadPrices(false);
    }, settings.refreshInterval * 1000);

    return () => clearInterval(intervalRef);
  }, [settings.refreshInterval, loadPrices]);

  // Derive detailed rates from raw data whenever it or currency changes
  useEffect(() => {
    if (!rawMarketData) return;

    const { gold, silver, platinum, palladium, commodities } = rawMarketData;

    if (gold?.ounce24k && silver?.ounce) {
      const gOunce = gold.ounce24k;
      const sOunce = silver.ounce;

      // Implied USD→PKR rate from the feed; other currencies use live FX.
      const exchangeRate = (gOunce.pkrPrice && gOunce.usdPrice)
        ? gOunce.pkrPrice / gOunce.usdPrice
        : rateOf(fxRates, 'PKR');
      const factor = tableCurrency === 'USD' ? 1
        : tableCurrency === 'PKR' ? exchangeRate
          : rateOf(fxRates, tableCurrency);

      const getPrice = (usdPrice: number) => {
        if (!usdPrice) return undefined;
        return usdPrice * factor;
      };

      const getChange = (usdChange: number) => {
        if (!usdChange) return 0;
        return usdChange * factor;
      };

      const rates = [
        {
          name: 'Gold',
          priceOunce: conv(gOunce.usdPrice, gOunce.pkrPrice),
          priceTola: (conv(gOunce.usdPrice, gOunce.pkrPrice) ?? 0) * 0.375,
          change: getChange(gOunce.change),
          changePercent: gOunce.changePercent || 0,
          weeklyPercent: commodities?.gold?.weekly,
          monthPercent: commodities?.gold?.monthly,
          yearPercent: commodities?.gold?.yearly,
          type: 'Gold'
        },
        {
          name: 'Silver',
          priceOunce: conv(sOunce.usdPrice, sOunce.pkrPrice),
          priceTola: (conv(sOunce.usdPrice, sOunce.pkrPrice) ?? 0) * 0.375,
          change: getChange(sOunce.change),
          changePercent: sOunce.changePercent || 0,
          weeklyPercent: commodities?.silver?.weekly,
          monthPercent: commodities?.silver?.monthly,
          yearPercent: commodities?.silver?.yearly,
          type: 'Silver'
        },
        {
          name: 'Platinum',
          priceOunce: conv(platinum?.ounce?.usdPrice, platinum?.ounce?.pkrPrice),
          priceTola: (conv(platinum?.ounce?.usdPrice, platinum?.ounce?.pkrPrice) ?? 0) * 0.375,
          change: getChange(platinum?.ounce?.change),
          changePercent: platinum?.ounce?.changePercent || 0,
          weeklyPercent: commodities?.platinum?.weekly,
          monthPercent: commodities?.platinum?.monthly,
          yearPercent: commodities?.platinum?.yearly,
          type: 'Platinum'
        },
        {
          name: 'Palladium',
          priceOunce: conv(palladium?.ounce?.usdPrice, palladium?.ounce?.pkrPrice),
          priceTola: (conv(palladium?.ounce?.usdPrice, palladium?.ounce?.pkrPrice) ?? 0) * 0.375,
          change: getChange(palladium?.ounce?.change),
          changePercent: palladium?.ounce?.changePercent || 0,
          weeklyPercent: commodities?.palladium?.weekly,
          monthPercent: commodities?.palladium?.monthly,
          yearPercent: commodities?.palladium?.yearly,
          type: 'Palladium'
        },
        {
          name: 'Copper',
          priceOunce: getPrice(commodities?.copper?.price),
          change: getChange(commodities?.copper?.change),
          changePercent: commodities?.copper?.changePercent,
          weeklyPercent: commodities?.copper?.weekly,
          monthPercent: commodities?.copper?.monthly,
          yearPercent: commodities?.copper?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Steel',
          priceOunce: getPrice(commodities?.steel?.price),
          change: getChange(commodities?.steel?.change),
          changePercent: commodities?.steel?.changePercent,
          weeklyPercent: commodities?.steel?.weekly,
          monthPercent: commodities?.steel?.monthly,
          yearPercent: commodities?.steel?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Lithium',
          priceOunce: getPrice(commodities?.lithium?.price),
          change: getChange(commodities?.lithium?.change),
          changePercent: commodities?.lithium?.changePercent,
          weeklyPercent: commodities?.lithium?.weekly,
          monthPercent: commodities?.lithium?.monthly,
          yearPercent: commodities?.lithium?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Iron Ore',
          priceOunce: getPrice(commodities?.ironOre?.price),
          change: getChange(commodities?.ironOre?.change),
          changePercent: commodities?.ironOre?.changePercent,
          weeklyPercent: commodities?.ironOre?.weekly,
          monthPercent: commodities?.ironOre?.monthly,
          yearPercent: commodities?.ironOre?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Aluminum',
          priceOunce: getPrice(commodities?.aluminum?.price),
          change: getChange(commodities?.aluminum?.change),
          changePercent: commodities?.aluminum?.changePercent,
          weeklyPercent: commodities?.aluminum?.weekly,
          monthPercent: commodities?.aluminum?.monthly,
          yearPercent: commodities?.aluminum?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Nickel',
          priceOunce: getPrice(commodities?.nickel?.price),
          change: getChange(commodities?.nickel?.change),
          changePercent: commodities?.nickel?.changePercent,
          weeklyPercent: commodities?.nickel?.weekly,
          monthPercent: commodities?.nickel?.monthly,
          yearPercent: commodities?.nickel?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Zinc',
          priceOunce: getPrice(commodities?.zinc?.price),
          change: getChange(commodities?.zinc?.change),
          changePercent: commodities?.zinc?.changePercent,
          weeklyPercent: commodities?.zinc?.weekly,
          monthPercent: commodities?.zinc?.monthly,
          yearPercent: commodities?.zinc?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Lead',
          priceOunce: getPrice(commodities?.lead?.price),
          change: getChange(commodities?.lead?.change),
          changePercent: commodities?.lead?.changePercent,
          weeklyPercent: commodities?.lead?.weekly,
          monthPercent: commodities?.lead?.monthly,
          yearPercent: commodities?.lead?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Tin',
          priceOunce: getPrice(commodities?.tin?.price),
          change: getChange(commodities?.tin?.change),
          changePercent: commodities?.tin?.changePercent,
          weeklyPercent: commodities?.tin?.weekly,
          monthPercent: commodities?.tin?.monthly,
          yearPercent: commodities?.tin?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Cobalt',
          priceOunce: getPrice(commodities?.cobalt?.price),
          change: getChange(commodities?.cobalt?.change),
          changePercent: commodities?.cobalt?.changePercent,
          weeklyPercent: commodities?.cobalt?.weekly,
          monthPercent: commodities?.cobalt?.monthly,
          yearPercent: commodities?.cobalt?.yearly,
          type: 'Industrial'
        },
        {
          name: 'Uranium',
          priceOunce: getPrice(commodities?.uranium?.price),
          change: getChange(commodities?.uranium?.change),
          changePercent: commodities?.uranium?.changePercent,
          weeklyPercent: commodities?.uranium?.weekly,
          monthPercent: commodities?.uranium?.monthly,
          yearPercent: commodities?.uranium?.yearly,
          type: 'Industrial'
        },
      ];
      setDetailedRates(rates);
    }
  }, [rawMarketData, tableCurrency]);

  // Fetch REAL history from Yahoo (USD/oz) whenever a chart timeframe changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/metals-history?metal=gold&timeframe=${goldChartTF}`);
        const json = await res.json();
        if (!cancelled && json?.success && Array.isArray(json.data) && json.data.length) setGoldRaw(json);
      } catch { /* keep previous */ }
    })();
    return () => { cancelled = true; };
  }, [goldChartTF]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/metals-history?metal=silver&timeframe=${silverChartTF}`);
        const json = await res.json();
        if (!cancelled && json?.success && Array.isArray(json.data) && json.data.length) setSilverRaw(json);
      } catch { /* keep previous */ }
    })();
    return () => { cancelled = true; };
  }, [silverChartTF]);

  // Scale the real USD/oz candles to the displayed currency+unit, anchoring the
  // last close to the live spot price. Also derive the 52-week range in PKR.
  useEffect(() => {
    const gold = rawMarketData?.gold;
    const silver = rawMarketData?.silver;

    // Implied USD→PKR rate from the live gold ounce quote (falls back to live FX).
    const fx = (gold?.ounce24k?.pkrPrice && gold?.ounce24k?.usdPrice)
      ? gold.ounce24k.pkrPrice / gold.ounce24k.usdPrice
      : rateOf(fxRates, 'PKR');

    const scaleCandles = (raw: any, anchorDisplay?: number) => {
      if (!raw?.data?.length) return [];
      const lastClose = raw.data[raw.data.length - 1].close;
      if (!lastClose) return [];
      const scale = (anchorDisplay && anchorDisplay > 0) ? anchorDisplay / lastClose : 1;
      return raw.data.map((c: any) => ({
        time: c.time,
        open: c.open * scale,
        high: c.high * scale,
        low: c.low * scale,
        close: c.close * scale,
        volume: c.volume,
      }));
    };

    // Gold chart is quoted per tola; silver per ounce (matches the spot cards).
    const goldAnchor = conv(gold?.tola24k?.usdPrice, gold?.tola24k?.pkrPrice) ?? undefined;
    const silverAnchor = conv(silver?.ounce?.usdPrice, silver?.ounce?.pkrPrice) ?? undefined;
    setGoldCandles(scaleCandles(goldRaw, goldAnchor));
    setSilverCandles(scaleCandles(silverRaw, silverAnchor));

    // 52-week range in PKR (gold per tola = USD/oz × fx × 0.375; silver per oz = USD/oz × fx).
    if (goldRaw?.fiftyTwoWeekHigh && goldRaw?.fiftyTwoWeekLow) {
      setGold52w({ low: goldRaw.fiftyTwoWeekLow * fx * 0.375, high: goldRaw.fiftyTwoWeekHigh * fx * 0.375 });
    }
    if (silverRaw?.fiftyTwoWeekHigh && silverRaw?.fiftyTwoWeekLow) {
      setSilver52w({ low: silverRaw.fiftyTwoWeekLow * fx, high: silverRaw.fiftyTwoWeekHigh * fx });
    }
  }, [goldRaw, silverRaw, rawMarketData, tableCurrency]);

  // --- Weight calculator helpers (support Gold, Silver, Platinum, Palladium) ---
  const OZ_TO_GRAM = 31.1035;   // 1 troy ounce in grams
  const OZ_TO_TOLA = 0.375;     // 11.6638g / 31.1035g ≈ 0.375

  // Live per-ounce spot for a metal in the active currency.
  const getMetalOunce = (metal: string) => {
    const src =
      metal === 'gold' ? rawMarketData?.gold?.ounce24k :
        metal === 'silver' ? rawMarketData?.silver?.ounce :
          metal === 'platinum' ? rawMarketData?.platinum?.ounce :
            metal === 'palladium' ? rawMarketData?.palladium?.ounce : null;
    if (!src) return 0;
    return conv(src.usdPrice, src.pkrPrice) || 0;
  };

  // ── Gold purity ─────────────────────────────────────────────────────────
  // Karat is a 24ths fraction of pure gold, so any value works arithmetically —
  // the presets are just the grades traded most often. Anything else (20K, 16K,
  // a half-karat assay result) goes through the custom field.
  const activeKarat = calcPurity === CUSTOM_KARAT
    ? clampKarat(customKarat)
    : (parseFloat(calcPurity) || 24);

  // Base price per selected weight unit (before purity/quantity).
  const getMetalBasePrice = (metal: string, unit: string) => {
    const oz = getMetalOunce(metal);
    if (!oz) return 0;
    if (unit === 'Ounce') return oz;
    if (unit === 'Tola') return oz * OZ_TO_TOLA;
    if (unit === 'Gram') return oz / OZ_TO_GRAM;
    if (unit === 'Kg') return (oz / OZ_TO_GRAM) * 1000;
    return oz;
  };

  // Calculator output: spot × purity × quantity, in the active currency.
  const calcTotal = () => {
    const basePrice = getMetalBasePrice(calcMetal, calcUnit);
    // Purity grade only reduces value for gold; other metals are quoted at spot.
    const purityRatio = calcMetal === 'gold' ? activeKarat / 24 : 1;
    return basePrice * purityRatio * calcQuantity;
  };

  // The headline can run to millions (PKR, high quantities) — step the type down
  // as it grows so it never overflows the card and gets clipped.
  const headlineSize = (text: string) =>
    text.length <= 7 ? 'text-3xl sm:text-5xl'
      : text.length <= 10 ? 'text-2xl sm:text-4xl'
        : text.length <= 13 ? 'text-xl sm:text-3xl'
          : 'text-lg sm:text-2xl';

  const CALC_METALS = [
    { key: 'gold', label: 'Gold (24K)', icon: Award, active: 'bg-amber-500/10 border-amber-500 text-amber-600' },
    { key: 'silver', label: 'Silver (999)', icon: Circle, active: 'bg-zinc-500/10 border-zinc-500 text-zinc-600' },
    { key: 'platinum', label: 'Platinum', icon: Gem, active: 'bg-sky-500/10 border-sky-500 text-sky-600' },
    { key: 'palladium', label: 'Palladium', icon: Circle, active: 'bg-emerald-500/10 border-emerald-500 text-emerald-600' },
  ];

  if (loading && !rawMarketData) return <PageSkeleton variant="metals" />;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-app-dark selection:bg-blue-500/30 overflow-x-clip">
      <div className="safe-top sticky top-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 shadow-sm w-full">
        <div className="pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 page-shell mx-auto">
          <div className="flex flex-row justify-between items-center gap-3 sm:gap-6">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-3xl font-black text-zinc-900 dark:text-zinc-50 flex items-center gap-2 uppercase italic tracking-tighter min-w-0">
                <Gem className="w-5 h-5 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} />
                <FitText className="min-w-0 flex-1">Precious Metals</FitText>
                <span className="hidden sm:inline-block bg-blue-500 text-white text-[11px] font-black px-2 py-0.5 rounded uppercase tracking-widest animate-pulse shrink-0">
                  Live
                </span>
              </h1>
              <p className="hidden sm:flex text-zinc-500 dark:text-zinc-400 text-[11px] mt-1 items-center gap-2 uppercase font-black tracking-widest">
                <span className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-500' : 'bg-green-500'} animate-pulse`}></span>
                <FreshnessBadge fetchedAt={fetchedAt} failed={refreshFailed} loading={loading} onRetry={() => loadPrices(true)} prefix="Last updated" />
              </p>
            </div>

            <div className="shrink-0"><CurrencyToggle /></div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-8 page-shell mx-auto w-full">
        {error && (
          <div className="mb-6 bg-amber-50 dark:bg-amber-900 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
            <p className="text-amber-800 dark:text-amber-200 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} /> {error}</p>
          </div>
        )}

        {/* 52-week range + price-target alerts (sourced in PKR, shown in the active currency) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          <MetalStatCard
            metal="GOLD"
            label="Gold 24K"
            icon="gold"
            baseUnit="Tola"
            currentPrice={rawMarketData?.gold?.tola24k?.pkrPrice}
            change={rawMarketData?.gold?.tola24k?.change}
            changePercent={rawMarketData?.gold?.tola24k?.changePercent}
            low52={gold52w.low}
            high52={gold52w.high}
            accent="from-amber-500 to-yellow-600"
            pkrPerUsd={rawMarketData?.gold?.ounce24k?.usdPrice ? rawMarketData.gold.ounce24k.pkrPrice / rawMarketData.gold.ounce24k.usdPrice : undefined}
          />
          <MetalStatCard
            metal="SILVER"
            label="Silver 999"
            icon="silver"
            baseUnit="Ounce"
            currentPrice={rawMarketData?.silver?.ounce?.pkrPrice}
            change={rawMarketData?.silver?.ounce?.change}
            changePercent={rawMarketData?.silver?.ounce?.changePercent}
            low52={silver52w.low}
            high52={silver52w.high}
            accent="from-zinc-500 to-zinc-700"
            pkrPerUsd={rawMarketData?.gold?.ounce24k?.usdPrice ? rawMarketData.gold.ounce24k.pkrPrice / rawMarketData.gold.ounce24k.usdPrice : undefined}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6 sm:mb-12 w-full max-w-lg mx-auto">
          <button
            onClick={() => setShowMore(true)}
            className="group w-full flex items-center justify-center gap-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-4 sm:px-6 py-3 shadow-sm hover:shadow-xl transition-all duration-300 hover:border-blue-500/50"
          >
            <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter">Analyze Weight</span>
          </button>
          <button
            onClick={() => setShowPurity(true)}
            className="group w-full flex items-center justify-center gap-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-4 sm:px-6 py-3 shadow-sm hover:shadow-xl transition-all duration-300 hover:border-amber-500/50"
          >
            <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
              <Gem className="w-4 h-4 text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter">Gold Purity</span>
          </button>
        </div>

        {showMore && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setShowMore(false)}></div>
            <div className="relative bg-white dark:bg-app-dark rounded-2xl sm:rounded-[3rem] p-5 sm:p-8 md:p-12 shadow-2xl border border-zinc-200 dark:border-white/5 w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-300">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>
              <button onClick={() => setShowMore(false)} aria-label="Close weight calculator" className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors text-zinc-500 dark:text-zinc-400 z-20"><X className="w-4 h-4" strokeWidth={2.5} /></button>

              <div className="relative z-10">
                <h2 className="text-xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter mb-6 sm:mb-12 flex items-center gap-3">
                  <span className="w-12 h-1.5 bg-blue-600 rounded-full"></span>
                  Metal Price Calculator
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
                  <div className="space-y-6 sm:space-y-10">
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest pl-2">Selection Logic</label>
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        {CALC_METALS.map((m) => {
                          const Icon = m.icon;
                          const selected = calcMetal === m.key;
                          return (
                            <button
                              key={m.key}
                              onClick={() => setCalcMetal(m.key)}
                              className={`flex items-center justify-center gap-2.5 p-4 sm:p-5 rounded-3xl border-2 transition-all duration-300 font-bold text-sm ${selected ? m.active : 'bg-zinc-50 dark:bg-zinc-800 border-transparent text-zinc-500'}`}
                            >
                              <Icon className="w-5 h-5 shrink-0" strokeWidth={2} /> {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {calcMetal === 'gold' && (
                        <div className="space-y-4">
                          <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest pl-2">Purity Grade</label>
                          <select
                            value={calcPurity}
                            onChange={(e) => setCalcPurity(e.target.value)}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-none rounded-3xl p-5 font-bold transition-all focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50"
                          >
                            {KARAT_PRESETS.map(k => (
                              <option key={k} value={`${k}K`}>{k}K ({purityPct(k)}%)</option>
                            ))}
                            <option value={CUSTOM_KARAT}>Custom karat…</option>
                          </select>

                          {/* Any karat the presets don't cover — 20K, 16K, 12K, or a
                              half-karat assay figure. */}
                          {calcPurity === CUSTOM_KARAT && (
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={1}
                                max={24}
                                step={0.1}
                                value={customKarat}
                                onChange={(e) => setCustomKarat(e.target.value)}
                                placeholder="20"
                                aria-label="Custom karat"
                                className="w-32 bg-zinc-50 dark:bg-zinc-800 border-none rounded-3xl p-5 font-bold text-center tabular-nums transition-all focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50"
                              />
                              <div className="min-w-0">
                                <p className="text-lg font-black tabular-nums leading-none text-zinc-900 dark:text-zinc-50">
                                  {activeKarat}K
                                </p>
                                <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mt-1">
                                  {purityPct(activeKarat)}% pure
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="space-y-4 flex-1">
                        <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest pl-2">Weight Metric</label>
                        <select
                          value={calcUnit}
                          onChange={(e) => setCalcUnit(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-800 border-none rounded-3xl p-5 font-bold transition-all focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50"
                        >
                          <option value="Tola">Tola</option>
                          <option value="Gram">Gram</option>
                          <option value="Ounce">Ounce (oz)</option>
                          <option value="Kg">Kilogram (kg)</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest pl-2">Execution Quantity</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={calcQuantity}
                          onChange={(e) => setCalcQuantity(parseFloat(e.target.value) || 0)}
                          className="w-full bg-zinc-50 dark:bg-zinc-800 border-none rounded-3xl p-4 sm:p-6 text-xl sm:text-2xl font-black transition-all focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50 font-mono"
                          placeholder="0.00"
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-400 font-black uppercase tracking-widest text-xs pointer-events-none">
                          {calcUnit}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center items-center bg-blue-600 rounded-[2.5rem] p-6 sm:p-8 text-white shadow-2xl shadow-blue-500/20 relative group overflow-hidden">
                    {/* Animated background pulse */}
                    <div className="absolute inset-0 bg-white/5 group-hover:bg-white/10 transition-colors pointer-events-none" />
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />

                    <div className="relative z-10 text-center space-y-8 w-full min-w-0">
                      <p className="text-[12px] font-black uppercase tracking-[0.4em] text-blue-100/60">Estimated Market Value</p>

                      <div className="space-y-2 min-w-0">
                        {(() => {
                          const text = calcTotal().toLocaleString(undefined, { maximumFractionDigits: 0 });
                          return (
                            <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 min-w-0 w-full">
                              <span className="text-xl sm:text-3xl font-medium text-blue-200 lowercase shrink-0">{sym}</span>
                              <span
                                title={`${sym}${text}`}
                                className={`${headlineSize(text)} font-black tracking-tighter font-mono tabular-nums leading-none min-w-0`}
                              >
                                {text}
                              </span>
                            </div>
                          );
                        })()}
                        {/* Name the purity the figure was struck at — with a free
                            karat field, the number alone is ambiguous. */}
                        <p className="text-blue-100/40 text-[11px] font-black uppercase tracking-widest">
                          {calcMetal === 'gold' && `${activeKarat}K · ${purityPct(activeKarat)}% pure · `}
                          {calcQuantity} {calcUnit}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-8 border-t border-white/10 min-w-0">
                        <div className="space-y-1 min-w-0">
                          <p className="text-[11px] font-black text-blue-200/50 uppercase">Current Bid / Tola</p>
                          <p className="font-bold text-sm sm:text-base font-mono tabular-nums break-all">
                            {sym}
                            {getMetalBasePrice(calcMetal, 'Tola').toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="space-y-1 min-w-0">
                          <p className="text-[11px] font-black text-blue-200/50 uppercase">Base Spread</p>
                          <p className="font-bold text-sm sm:text-base">0.05% Fixed</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card mt-8 overflow-hidden">
          <div className="p-4 sm:p-8 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 flex items-center gap-2 uppercase italic tracking-tighter">
                Spot Market Rates
                <span className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{tableCurrency}</span>
              </h2>
              <p className="text-zinc-500 text-[11px] font-black uppercase tracking-widest mt-1">Live spot benchmarks · scroll for more</p>
            </div>
          </div>
          <div className="overflow-auto max-h-[360px] custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-white dark:bg-zinc-900 sticky top-0 z-10">
                <tr className="border-b border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400">
                  <th className="p-2 sm:p-4 font-normal text-xs uppercase whitespace-nowrap hidden md:table-cell">Last Updated</th>
                  <th className="p-2 sm:p-4 font-normal text-xs uppercase whitespace-nowrap">Metal</th>
                  <th className="p-2 sm:p-4 font-normal text-xs uppercase text-right whitespace-nowrap hidden sm:table-cell">Price (Ounce)</th>
                  <th className="p-2 sm:p-4 font-normal text-xs uppercase text-right whitespace-nowrap">Price (Tola)</th>
                  <th className="p-2 sm:p-4 font-normal text-xs uppercase text-center">Daily</th>
                  <th className="p-2 sm:p-4 font-normal text-xs uppercase text-center hidden sm:table-cell">Weekly</th>
                  <th className="p-2 sm:p-4 font-normal text-xs uppercase text-center hidden lg:table-cell">Monthly</th>
                  <th className="p-2 sm:p-4 font-normal text-xs uppercase text-center hidden lg:table-cell">Yearly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {detailedRates.map((item) => (
                  <tr key={item.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="p-2 sm:p-4 text-[11px] text-zinc-500 whitespace-nowrap hidden md:table-cell">{fetchedAt ? new Date(fetchedAt).toLocaleString() : "—"}</td>
                    <td className="p-2 sm:p-4 font-bold text-zinc-900 dark:text-zinc-50 whitespace-nowrap">{item.name}</td>
                    <td className="p-2 sm:p-4 text-right font-mono font-medium whitespace-nowrap hidden sm:table-cell">{item.priceOunce ? sym + item.priceOunce.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</td>
                    <td className="p-2 sm:p-4 text-right font-mono font-medium whitespace-nowrap">{item.priceTola ? sym + item.priceTola.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</td>
                    <td className="p-2 sm:p-4 text-center">
                      <span className={`text-xs font-bold ${(item.changePercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{item.changePercent ? (item.changePercent > 0 ? '+' : '') + item.changePercent + '%' : '-'}</span>
                    </td>
                    <td className="p-2 sm:p-4 text-center hidden sm:table-cell">{item.weeklyPercent ? item.weeklyPercent + '%' : '-'}</td>
                    <td className="p-2 sm:p-4 text-center hidden lg:table-cell">{item.monthPercent ? item.monthPercent + '%' : '-'}</td>
                    <td className="p-2 sm:p-4 text-center hidden lg:table-cell">{item.yearPercent ? item.yearPercent + '%' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* showPurity Toggle moved to Table Header below for better UX */}

        <div className="mt-8 sm:mt-12 space-y-6 sm:space-y-12">
          {/* Purity Breakdown Modal */}
          {showPurity && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300"
                onClick={() => setShowPurity(false)}
              ></div>

              <div className="relative bg-white dark:bg-app-dark rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 shadow-2xl border border-zinc-200 dark:border-white/5 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent"></div>

                <div className="flex justify-between items-center mb-5 sm:mb-6 shrink-0">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter">Gold Purity Breakdown</h2>
                    <p className="text-[10px] sm:text-[11px] font-black text-zinc-400 uppercase tracking-widest mt-1">Institutional Valuation Reference Guide</p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <select
                      value={purityUnit}
                      onChange={(e) => setPurityUnit(e.target.value)}
                      className="bg-zinc-100 dark:bg-white/5 border-none rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest focus:ring-2 focus:ring-amber-500 transition-all cursor-pointer outline-none"
                    >
                      <option value="Tola">Per Tola</option>
                      <option value="Gram">Per Gram</option>
                      <option value="Ounce">Per Ounce</option>
                      <option value="Kg">Per Kg</option>
                    </select>
                    <button
                      onClick={() => setShowPurity(false)}
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors text-zinc-500 dark:text-zinc-400"
                    >
                      <X className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                <div className="overflow-y-auto pr-4 custom-scrollbar">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                      <thead>
                        <tr className="text-zinc-400">
                          <th className="pb-4 px-4 font-black uppercase tracking-widest text-[11px] hidden sm:table-cell">Reference</th>
                          <th className="pb-4 px-4 font-black uppercase tracking-widest text-[11px]">Grade</th>
                          <th className="pb-4 px-4 font-black uppercase tracking-widest text-[11px] hidden sm:table-cell">Purity</th>
                          <th className="pb-4 px-4 font-black uppercase tracking-widest text-[11px] text-right">{tableCurrency} Market Rate</th>
                          <th className="pb-4 px-4 font-black uppercase tracking-widest text-[11px] text-right">Movement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caratPrices.map((item) => {
                          let factor = 1;
                          if (purityUnit === "Gram") factor = 1 / 11.6638;
                          if (purityUnit === "Ounce") factor = 1 / 0.375;
                          if (purityUnit === "Kg") factor = 1000 / 11.6638;
                          const displayPrice = (conv(item.usd, item.pkr) ?? 0) * factor;
                          // The gold feed quotes `change` in PKR.
                          const displayChange = (convertFrom(item.change, 'PKR') ?? 0) * factor;
                          return (
                            <tr key={item.carat} className="bg-zinc-50 dark:bg-white/[0.02] hover:bg-zinc-100 dark:hover:bg-white/5 transition-all group">
                              <td className="py-3 px-3 sm:px-4 first:rounded-l-2xl text-[11px] font-mono text-zinc-500 border-y border-l border-transparent dark:border-white/5 hidden sm:table-cell">{fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : "—"}</td>
                              <td className="py-3 px-3 sm:px-4 rounded-l-2xl sm:rounded-l-none font-black text-amber-600 italic text-base border-y border-l sm:border-l-0 border-transparent dark:border-white/5">
                                {item.carat}
                                <span className="sm:hidden block text-[11px] font-bold text-zinc-400 not-italic mt-0.5">{item.purity}% Pure</span>
                              </td>
                              <td className="py-3 px-3 sm:px-4 font-bold text-zinc-400 border-y border-transparent dark:border-white/5 hidden sm:table-cell">{item.purity}% Pure</td>
                              <td className="py-3 px-3 sm:px-4 font-mono font-black text-zinc-900 dark:text-zinc-50 text-right text-base border-y border-transparent dark:border-white/5">
                                {sym} {displayPrice.toLocaleString(undefined, { maximumFractionDigits: purityUnit === 'Tola' || purityUnit === 'Kg' ? 0 : 2 })}
                              </td>
                              <td className={`py-3 px-3 sm:px-4 last:rounded-r-2xl font-black text-right border-y border-r border-transparent dark:border-white/5 ${displayChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {displayChange >= 0 ? '+' : ''}{displayChange.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-10 p-6 bg-amber-500/5 rounded-[2rem] border border-amber-500/10">
                    <p className="text-[11px] text-amber-500/70 font-black uppercase tracking-widest text-center">Calculations based on 24K Gold Reference of {sym}{conv(caratPrices[0]?.usd, caratPrices[0]?.pkr)?.toLocaleString(undefined, { maximumFractionDigits: 2 })} per Tola</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Velocity Terminal graph moved to its own route: Gold & Silver → Graph Analysis (/metals/analysis) */}
        </div>

        {/* Bottom charts removed in favor of integrated velocity terminal above */}
      </div>
    </div>
  );
}
