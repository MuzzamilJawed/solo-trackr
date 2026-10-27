"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
    ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
    ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { BookOpen, X, Check, Lightbulb, BarChart3, AlertTriangle, ArrowLeft, Download, TrendingDown, TrendingUp, Search } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoricalYear {
    year: string;
    revenue: number | null;
    netIncome: number | null;
}

interface ReportData {
    symbol: string;
    exchange: string;
    name: string;
    sector: string;
    industry: string;
    description: string;
    currency: string;
    rating: string;
    currentPrice: number | null;
    targetPrice: number | null;
    targetHigh: number | null;
    targetLow: number | null;
    upsidePotential: number | null;
    change: number | null;
    changePercent: number | null;
    volume: number | null;
    marketCap: number | null;
    financials: {
        revenue: number | null;
        operatingIncome: number | null;
        netIncome: number | null;
        totalAssets: number | null;
        totalEquity: number | null;
        fcf: number | null;
        sharesOutstanding: number | null;
        historicalRevenue: HistoricalYear[];
    };
    metrics: {
        grossMargin: number | null;
        operatingMargin: number | null;
        netMargin: number | null;
        pe: number | null;
        forwardPE: number | null;
        evEbitda: number | null;
        pb: number | null;
        eps: number | null;
        roe: number | null;
        debtToEquity: number | null;
        beta: number | null;
        bookValuePerShare: number | null;
        quickRatio: number | null;
        currentRatio: number | null;
        dividendYield: number | null;
    };
    technical: {
        trend: string;
        signal: string;
        fiftyTwoWeekHigh: number | null;
        fiftyTwoWeekLow: number | null;
        fiftyDayAvg: number | null;
        twoHundredDayAvg: number | null;
        support: number[];
        resistance: number[];
        dayHigh: number | null;
        dayLow: number | null;
        ldcp: number | null;
    };
    analysts: {
        strongBuy: number;
        buy: number;
        hold: number;
        sell: number;
        strongSell: number;
        total: number;
        recMean: number | null;
    };
    pricePlan: {
        entryLow: number | null;
        entryHigh: number | null;
        stopLoss: number | null;
        target1: number | null;
        target2: number | null;
        target3: number | null;
    };
    psxStats: Record<string, string> | null;
    psxFinancials: {
        years: string[];
        rows: { label: string; values: string[] }[];
    } | null;
    dataSources: { yahoo: boolean; psx: boolean };
    generatedAt: string;
}

// ─── Glossary ─────────────────────────────────────────────────────────────────

const GLOSSARY: Record<string, { term: string; definition: string; howToUse: string }> = {
    "P/E (TTM)": {
        term: "Price-to-Earnings Ratio (Trailing Twelve Months)",
        definition: "How much investors pay for every 1 unit of earnings. Calculated as: Share Price ÷ Earnings Per Share (last 12 months).",
        howToUse: "Lower P/E generally means cheaper. A P/E of 8–12 is often considered undervalued; 20–30+ may indicate premium or growth pricing. Compare within the same sector.",
    },
    "Forward P/E": {
        term: "Forward Price-to-Earnings",
        definition: "Same as P/E but uses next year's estimated earnings instead of past earnings. Forward P/E reflects expected future profitability.",
        howToUse: "If Forward P/E < trailing P/E, earnings are expected to grow. A lower Forward P/E than peers suggests a more attractive entry point.",
    },
    "EV / EBITDA": {
        term: "Enterprise Value to EBITDA",
        definition: "Compares total company value (market cap + debt - cash) to operating cash earnings (EBITDA). More reliable than P/E for capital-heavy companies.",
        howToUse: "Under 10x is generally cheap; 15–20x+ can indicate premium. Use to compare companies with different debt structures.",
    },
    "Price / Book": {
        term: "Price-to-Book Ratio",
        definition: "Compares market value per share to book value (net assets) per share. A P/B of 1 means you're paying exactly what the company's assets are worth.",
        howToUse: "P/B below 1 may indicate undervaluation or asset-heavy business trading at discount. High P/B signals investor confidence in future growth.",
    },
    "Gross Margin": {
        term: "Gross Profit Margin",
        definition: "Percentage of revenue remaining after subtracting cost of goods sold (COGS). Formula: (Revenue - COGS) ÷ Revenue × 100.",
        howToUse: "Higher is better. Above 40% is excellent for most sectors. Falling gross margin signals pricing pressure or rising input costs.",
    },
    "Operating Margin": {
        term: "Operating Profit Margin",
        definition: "Percentage of revenue remaining after all operating expenses (salaries, rent, depreciation) but before interest and taxes.",
        howToUse: "Above 15% is strong. Consistent or rising operating margin signals good cost control and scalable business model.",
    },
    "Net Profit Margin": {
        term: "Net Profit Margin",
        definition: "Bottom-line profitability: percentage of revenue that becomes net income after ALL expenses, taxes, and interest.",
        howToUse: "Higher is better. Compare to industry peers. Negative margin means the company is losing money on each sale.",
    },
    "Return on Equity": {
        term: "Return on Equity (ROE)",
        definition: "Measures how efficiently management generates profit from shareholders' equity. Formula: Net Income ÷ Shareholders' Equity × 100.",
        howToUse: "Above 15% is considered good; above 20% is excellent. A consistently high ROE indicates a competitive moat and efficient management.",
    },
    "EPS (TTM)": {
        term: "Earnings Per Share (Trailing Twelve Months)",
        definition: "Total net profit divided by total shares outstanding. Represents the company's profit on a per-share basis.",
        howToUse: "Rising EPS over time signals profitable growth. Compare against peers and the stock's historical EPS trend.",
    },
    "Beta (vs Market)": {
        term: "Beta",
        definition: "Measures a stock's price volatility relative to the broader market. Beta of 1 = moves with market; Beta > 1 = more volatile; Beta < 1 = less volatile.",
        howToUse: "High beta (>1.5) stocks offer higher potential returns but greater risk. Low beta (<0.8) stocks are safer but may underperform in bull markets.",
    },
    "Debt / Equity": {
        term: "Debt-to-Equity Ratio",
        definition: "Total debt divided by shareholders' equity. Shows how much debt the company uses to finance its assets relative to equity.",
        howToUse: "Below 50% is generally safe; above 150% signals high leverage risk. Rising D/E in a rising rate environment is dangerous.",
    },
    "Book Value / Share": {
        term: "Book Value Per Share",
        definition: "Net asset value of the company divided by shares outstanding. Represents what shareholders would theoretically receive if the company was liquidated.",
        howToUse: "If current price is close to or below book value, the stock may be undervalued. Compare P/B ratio with this figure.",
    },
    "Quick Ratio": {
        term: "Quick Ratio (Acid Test)",
        definition: "Measures ability to pay short-term obligations using liquid assets only (cash + receivables). Excludes inventory. Formula: (Cash + Receivables) ÷ Current Liabilities.",
        howToUse: "Above 1 is healthy (can cover short-term debt). Below 0.5 may signal liquidity stress. Better than current ratio for volatile inventory businesses.",
    },
    "Current Ratio": {
        term: "Current Ratio",
        definition: "Measures short-term liquidity: Current Assets ÷ Current Liabilities. Shows ability to pay bills due within 12 months.",
        howToUse: "Above 1.5 is comfortable; below 1 means more short-term debt than assets — potential cash crunch signal.",
    },
    "Dividend Yield": {
        term: "Dividend Yield",
        definition: "Annual dividends paid per share as a percentage of the stock price. Formula: Annual Dividend ÷ Share Price × 100.",
        howToUse: "Higher yield = more income. But very high yields (above 8–10%) may signal a dividend cut risk. Check payout ratio and earnings stability.",
    },
    "Market Cap": {
        term: "Market Capitalization",
        definition: "Total market value of all outstanding shares. Formula: Share Price × Total Shares Outstanding.",
        howToUse: "Large cap (>10B): stable, lower risk. Mid cap (2–10B): growth potential. Small cap (<2B): higher growth potential but higher risk.",
    },
    "52-Week High": {
        term: "52-Week High Price",
        definition: "The highest price the stock has traded at in the past 52 weeks (one year).",
        howToUse: "If current price is near the 52-week high, the stock may be overbought or showing strong momentum. If far below, it may be cheap or in downtrend.",
    },
    "52-Week Low": {
        term: "52-Week Low Price",
        definition: "The lowest price the stock has traded at in the past 52 weeks.",
        howToUse: "A price near the 52-week low can signal a bargain — or a fundamentally troubled company. Always investigate the reason behind the drop.",
    },
    "50-Day Moving Avg": {
        term: "50-Day Moving Average",
        definition: "Average of the last 50 trading days' closing prices. A widely watched short-to-medium term trend indicator.",
        howToUse: "Price above 50-DMA = short-term uptrend. Price crossing above 50-DMA from below = bullish signal. Crossing below = bearish signal.",
    },
    "200-Day Moving Avg": {
        term: "200-Day Moving Average",
        definition: "Average of the last 200 trading days' closing prices. The most important long-term trend indicator.",
        howToUse: "'Golden Cross' (50-DMA crossing above 200-DMA) = strong buy signal. 'Death Cross' (50-DMA below 200-DMA) = bearish long-term signal.",
    },
    "LDCP": {
        term: "Last Day Closing Price",
        definition: "The official closing price of the stock from the previous trading day.",
        howToUse: "Compare to today's price to see intraday movement. Used to calculate the daily change percentage.",
    },
    "Day Range": {
        term: "Today's Trading Range",
        definition: "The lowest and highest price at which the stock traded during the current trading day.",
        howToUse: "A narrow day range suggests low volatility. A wide range signals high activity. Current price near day high shows bullish momentum; near day low shows selling pressure.",
    },
    "Volume": {
        term: "Trading Volume",
        definition: "Number of shares traded during a given period (usually the current day or average daily).",
        howToUse: "High volume on price increase = strong conviction buy signal. High volume on price drop = strong sell signal. Low volume moves are less reliable.",
    },
    "Upside Potential": {
        term: "Upside Potential (Expected Return)",
        definition: "Percentage gain expected from current price to the analyst target price. Formula: (Target Price - Current Price) ÷ Current Price × 100.",
        howToUse: "Positive upside = BUY signal. Negative = overvalued vs analyst consensus. Higher upside with high analyst conviction is a strong signal.",
    },
    "Entry Zone": {
        term: "Recommended Entry Price Zone",
        definition: "The price range at which it is considered a good risk/reward to initiate a position in this stock.",
        howToUse: "Buy within this zone to ensure you enter at a favorable price relative to the target and stop loss.",
    },
    "Stop Loss": {
        term: "Stop Loss Price",
        definition: "A pre-defined price level at which to sell the stock to limit losses if the trade goes against you.",
        howToUse: "Sell if the stock falls to or below this level. This protects your capital. Typically set 10–15% below entry price.",
    },
    "Support Level": {
        term: "Price Support Level",
        definition: "A price level where buying interest is historically strong enough to prevent the price from falling further.",
        howToUse: "Strong support near current price = lower downside risk. If support breaks, the next lower support becomes the new floor.",
    },
    "Resistance Level": {
        term: "Price Resistance Level",
        definition: "A price level where selling pressure historically prevents the price from rising further.",
        howToUse: "If current price is approaching resistance, the stock may stall or pull back. A breakout above resistance is a strong bullish signal.",
    },
    "Revenue": {
        term: "Total Revenue / Net Sales",
        definition: "The total amount of money generated from the company's core business activities before any expenses are deducted.",
        howToUse: "Consistently growing revenue is a healthy sign. Compare year-over-year (YoY) growth rates. Flat or declining revenue may signal market saturation.",
    },
    "Operating Income": {
        term: "Operating Income (EBIT)",
        definition: "Profit from core operations after operating expenses but before interest and taxes. Also called EBIT.",
        howToUse: "Rising operating income alongside revenue growth signals strong business efficiency. A lower operating income despite revenue growth signals rising costs.",
    },
    "Net Income (PAT)": {
        term: "Net Income / Profit After Tax",
        definition: "The final bottom-line profit after ALL expenses, interest, taxes are deducted. This is what belongs to shareholders.",
        howToUse: "Positive and growing net income = profitable company. Negative = loss-making. Compare net income margin (net income ÷ revenue) across years.",
    },
    "Free Cash Flow": {
        term: "Free Cash Flow (FCF)",
        definition: "Cash generated from operations minus capital expenditures. The actual cash left over after maintaining/expanding assets.",
        howToUse: "Positive FCF = company can fund dividends, buybacks, or acquisitions without external financing. Negative FCF can still be OK if the company is in high-growth phase.",
    },
    "Total Assets": {
        term: "Total Assets",
        definition: "Everything the company owns — cash, investments, property, equipment, receivables, intangibles.",
        howToUse: "Growing total assets generally signals business expansion. Compare to total liabilities to assess solvency. Assets must exceed liabilities for a healthy balance sheet.",
    },
    "Total Equity": {
        term: "Shareholders' Equity / Book Value",
        definition: "Total assets minus total liabilities. What shareholders theoretically own. Also called net worth or book value.",
        howToUse: "Positive and growing equity = financial health. Negative equity (more liabilities than assets) can signal financial distress.",
    },
    "Business Quality": {
        term: "Business Quality Score",
        definition: "A 1–5 score reflecting the quality of the company's core business, driven primarily by operating profit margin.",
        howToUse: "5/5 = exceptional (>25% operating margin). 3/5 = average. 1/5 = poor or loss-making. Higher scores indicate more durable competitive advantage.",
    },
    "Financial Health": {
        term: "Financial Health Score",
        definition: "A 1–5 score reflecting the company's balance sheet strength, driven by debt-to-equity ratio.",
        howToUse: "5/5 = very low leverage (<30% D/E). 1/5 = dangerously leveraged (>200% D/E). High score = more resilient in economic downturns.",
    },
    "Valuation": {
        term: "Valuation Score",
        definition: "A 1–5 score reflecting how cheap or expensive the stock appears based on P/E ratio.",
        howToUse: "5/5 = very cheap (P/E < 8). 1/5 = very expensive (P/E > 30). Higher score = better margin of safety for value investors.",
    },
    "Growth Potential": {
        term: "Growth Potential Score",
        definition: "A 1–5 score reflecting the company's historical revenue growth trajectory (CAGR over available years).",
        howToUse: "5/5 = >20% annual growth. 3/5 = moderate growth. 2/5 = flat/declining. Higher score = stronger earnings compounding potential.",
    },
    "Technical Picture": {
        term: "Technical Picture Score",
        definition: "A 1–5 score reflecting the current technical trend of the stock (uptrend vs. downtrend vs. neutral).",
        howToUse: "5/5 = strong uptrend (price > 50-DMA > 200-DMA). 1/5 = strong downtrend. Combine with fundamental scores for best results.",
    },
};

// ─── Glossary Modal ───────────────────────────────────────────────────────────

function GlossaryModal({ terms, onClose }: { terms: string[]; onClose: () => void }) {
    const validTerms = terms.filter((t) => GLOSSARY[t]);
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
                className="card relative w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.15em] text-blue-500 inline-flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" strokeWidth={2} /> Term Glossary</h3>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm font-black"
                    >
                        <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                </div>
                <div className="space-y-4">
                    {validTerms.length === 0 ? (
                        <p className="text-xs text-zinc-400">No glossary entries found for these terms.</p>
                    ) : (
                        validTerms.map((key) => {
                            const g = GLOSSARY[key];
                            return (
                                <div key={key} className="border border-zinc-100 dark:border-zinc-800 rounded-xl p-4">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-blue-500 mb-0.5">{key}</p>
                                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1">{g.term}</p>
                                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed mb-2">{g.definition}</p>
                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2">
                                        <p className="text-[11px] font-black text-amber-600 mb-0.5 inline-flex items-center gap-1"><Lightbulb className="w-3 h-3" strokeWidth={2} /> How to use</p>
                                        <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">{g.howToUse}</p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined, decimals = 2): string {
    if (val === null || val === undefined || isNaN(val as number)) return "—";
    return (val as number).toFixed(decimals);
}

function fmtPct(val: number | null | undefined): string {
    if (val === null || val === undefined || isNaN(val as number)) return "—";
    return ((val as number) * 100).toFixed(1) + "%";
}

function fmtLarge(val: number | null | undefined, ccy = ""): string {
    if (val === null || val === undefined || isNaN(val as number)) return "—";
    const pre = ccy ? ccy + " " : "";
    const v = val as number;
    const abs = Math.abs(v);
    if (abs >= 1e12) return pre + (v / 1e12).toFixed(2) + "T";
    if (abs >= 1e9)  return pre + (v / 1e9).toFixed(2)  + "B";
    if (abs >= 1e6)  return pre + (v / 1e6).toFixed(2)  + "M";
    if (abs >= 1e3)  return pre + (v / 1e3).toFixed(1)  + "K";
    return pre + v.toFixed(2);
}

function fmtPrice(val: number | null | undefined, ccy = ""): string {
    if (val === null || val === undefined || isNaN(val as number)) return "—";
    const pre = ccy ? ccy + " " : "";
    return pre + (val as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Determine what percentage of 52w range the current price is at
function rangePct(cur: number | null, low: number | null, high: number | null): number | null {
    if (cur === null || low === null || high === null || high === low) return null;
    return Math.min(100, Math.max(0, ((cur - low) / (high - low)) * 100));
}

function computeScores(r: ReportData) {
    const { metrics, technical, financials } = r;

    let bq = 3;
    if (metrics.operatingMargin !== null) {
        if (metrics.operatingMargin > 0.25) bq = 5;
        else if (metrics.operatingMargin > 0.15) bq = 4;
        else if (metrics.operatingMargin > 0.05) bq = 3;
        else bq = 2;
    }

    let fh = 3;
    if (metrics.debtToEquity !== null) {
        if (metrics.debtToEquity < 30) fh = 5;
        else if (metrics.debtToEquity < 60) fh = 4;
        else if (metrics.debtToEquity < 100) fh = 3;
        else if (metrics.debtToEquity < 200) fh = 2;
        else fh = 1;
    }

    let val = 3;
    if (metrics.pe !== null) {
        if (metrics.pe < 8) val = 5;
        else if (metrics.pe < 12) val = 4;
        else if (metrics.pe < 20) val = 3;
        else if (metrics.pe < 30) val = 2;
        else val = 1;
    }

    let gp = 3;
    const hist = financials.historicalRevenue;
    if (hist.length >= 2) {
        const last = hist[hist.length - 1]?.revenue;
        const first = hist[0]?.revenue;
        if (last && first && first > 0) {
            const cagr = Math.pow(last / first, 1 / (hist.length - 1)) - 1;
            if (cagr > 0.2) gp = 5;
            else if (cagr > 0.1) gp = 4;
            else if (cagr > 0) gp = 3;
            else gp = 2;
        }
    }

    let tp = 3;
    if (technical.signal === "BUY") tp = 4;
    else if (technical.signal === "STRONG BUY") tp = 5;
    else if (technical.signal === "SELL") tp = 2;
    else if (technical.signal === "STRONG SELL") tp = 1;

    return { businessQuality: bq, financialHealth: fh, valuation: val, growthPotential: gp, technicalPicture: tp };
}

function generateRisks(r: ReportData): { title: string; detail: string }[] {
    const risks: { title: string; detail: string }[] = [];
    if (r.metrics.beta !== null && r.metrics.beta > 1.3)
        risks.push({ title: "High Market Volatility", detail: `Beta ${fmt(r.metrics.beta)} — above-average price swings vs market` });
    if (r.metrics.debtToEquity !== null && r.metrics.debtToEquity > 100)
        risks.push({ title: "High Leverage", detail: `D/E of ${fmt(r.metrics.debtToEquity)}% — debt burden could strain in rising rate environment` });
    if (r.metrics.pe !== null && r.metrics.pe > 25)
        risks.push({ title: "Valuation Premium", detail: `P/E of ${fmt(r.metrics.pe)}x — limited room for earnings disappointment` });
    if (r.metrics.currentRatio !== null && r.metrics.currentRatio < 1)
        risks.push({ title: "Liquidity Concern", detail: `Current ratio of ${fmt(r.metrics.currentRatio)} — short-term liabilities exceed current assets` });
    risks.push({ title: "Macro & Interest Rate Risk", detail: "Economic slowdown and rate hikes can compress valuations and earnings" });
    risks.push({ title: "Currency & Inflation Risk", detail: `${r.currency} fluctuations affect real returns and import costs` });
    risks.push({ title: "Regulatory & Tax Risk", detail: "Policy changes, new taxes or sector-specific regulation" });
    return risks.slice(0, 7);
}

function generateMoat(r: ReportData): string[] {
    const moat: string[] = [];
    if (r.metrics.grossMargin !== null && r.metrics.grossMargin > 0.2)
        moat.push(`Strong gross margins of ${fmtPct(r.metrics.grossMargin)} signal meaningful pricing power`);
    if (r.metrics.roe !== null && r.metrics.roe > 0.15)
        moat.push(`High ROE of ${fmtPct(r.metrics.roe)} reflects efficient capital deployment`);
    if (r.metrics.operatingMargin !== null && r.metrics.operatingMargin > 0.12)
        moat.push(`Operating margin of ${fmtPct(r.metrics.operatingMargin)} above industry norms`);
    if (r.metrics.currentRatio !== null && r.metrics.currentRatio > 1.5)
        moat.push(`Current ratio of ${fmt(r.metrics.currentRatio)} indicates strong short-term financial safety`);
    if (r.metrics.dividendYield !== null && r.metrics.dividendYield > 0.03)
        moat.push(`Dividend yield of ${fmtPct(r.metrics.dividendYield)} rewards long-term shareholders`);
    moat.push("Established brand and long-standing market presence");
    moat.push("Diversified revenue streams reduce single-point-of-failure risk");
    return moat.slice(0, 5);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBlocks({ score, max = 5 }: { score: number; max?: number }) {
    return (
        <div className="flex gap-1">
            {Array.from({ length: max }).map((_, i) => (
                <div key={i} className={`h-2.5 w-5 rounded-sm ${i < score ? "bg-blue-500" : "bg-zinc-200 dark:bg-zinc-700"}`} />
            ))}
        </div>
    );
}

function SectionTitle({ num, label, color = "text-blue-500" }: { num?: string | number; label: string; color?: string }) {
    return (
        // pr-11 keeps the title clear of the card's absolutely-positioned "?"
        // button, which a wrapped heading otherwise runs underneath on a phone.
        <h2 className={`text-[10px] font-black uppercase tracking-[0.15em] ${color} mb-3 pr-11 flex items-start gap-2`}>
            {num !== undefined && (
                <span className="inline-flex shrink-0 items-center justify-center w-4 h-4 rounded text-[10px] font-black" style={{ backgroundColor: "currentColor" }}>
                    <span className="text-white">{num}</span>
                </span>
            )}
            <span className="min-w-0">{label}</span>
        </h2>
    );
}

// Score item component (extracted to avoid hooks-in-map violation)
function ScoreItem({ label, score, glossaryKey }: { label: string; score: number; glossaryKey: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button onClick={() => setOpen(true)} className="no-print text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 hover:text-blue-500 transition-colors flex items-center gap-1">
                {label} <span className="w-3 h-3 rounded-full bg-zinc-200 dark:bg-zinc-700 text-[7px] flex items-center justify-center text-zinc-500">?</span>
            </button>
            <p className="print-only text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 hidden print:block">{label}</p>
            <ScoreBlocks score={score} />
            <p className="text-[10px] text-zinc-400 mt-1">{score}/5</p>
            {open && <GlossaryModal terms={[glossaryKey]} onClose={() => setOpen(false)} />}
        </div>
    );
}

// Card with optional glossary button
function Card({
    children, className = "", glossaryTerms,
}: {
    children: React.ReactNode; className?: string; glossaryTerms?: string[];
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`card relative p-5 ${className}`}>
            {glossaryTerms && glossaryTerms.length > 0 && (
                <button
                    onClick={() => setOpen(true)}
                    className="no-print absolute top-3 right-3 w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-500 text-[11px] font-black flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors"
                    title="What do these terms mean?"
                >
                    ?
                </button>
            )}
            {children}
            {open && glossaryTerms && <GlossaryModal terms={glossaryTerms} onClose={() => setOpen(false)} />}
        </div>
    );
}

// ─── DataBadge: shows value with "Not available" fallback note ────────────────

function DataBadge({ val, note }: { val: string; note?: string }) {
    const isMissing = val === "—";
    return (
        <span className={`text-[11px] font-black font-mono ${isMissing ? "text-zinc-400 italic" : "text-zinc-900 dark:text-white"}`}>
            {isMissing ? (note ?? "Not available") : val}
        </span>
    );
}

// ─── Main report inner component ──────────────────────────────────────────────

function ReportContent({ symbol }: { symbol: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const exchange = searchParams.get("exchange") || "PSX";
    const [report, setReport] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch(`/api/stock-report/${symbol}?exchange=${exchange}`);
                const json = await res.json();
                if (json.success) setReport(json.data);
                else setError(json.error || "Failed to load report");
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [symbol, exchange]);

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="relative mx-auto w-14 h-14">
                        <div className="w-14 h-14 border-4 border-blue-600/20 rounded-full" />
                        <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
                        <div className="absolute inset-0 flex items-center justify-center text-blue-600"><BarChart3 className="w-5 h-5" strokeWidth={2} /></div>
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white">Generating Report</p>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-400 mt-1 animate-pulse">Fetching financial intelligence…</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center">
                <div className="text-center space-y-3">
                    <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" strokeWidth={2} />
                    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Report unavailable</p>
                    <p className="text-xs text-red-400">{error}</p>
                    <button onClick={() => router.back()} className="mt-2 text-blue-500 hover:underline text-xs font-bold inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Go Back</button>
                </div>
            </div>
        );
    }

    const scores = computeScores(report);
    const risks = generateRisks(report);
    const moat = generateMoat(report);
    const { currency } = report;

    const ratingStyle =
        report.rating.includes("BUY")
            ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700"
            : report.rating.includes("SELL")
            ? "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700"
            : "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700";

    const sigStyle =
        report.technical.signal === "BUY"
            ? "text-green-600 bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
            : report.technical.signal === "SELL"
            ? "text-red-600 bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
            : "text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700";

    // Chart data — revenue in billions
    const chartData = report.financials.historicalRevenue.map((h) => ({
        year: h.year,
        Revenue: h.revenue ? +(h.revenue / 1e9).toFixed(2) : null,
        "Net Income": h.netIncome ? +(h.netIncome / 1e9).toFixed(2) : null,
    }));

    const psxRows = report.psxFinancials?.rows ?? [];
    const psxYears = report.psxFinancials?.years ?? [];

    // 52-week range position
    const rangePosition = rangePct(report.currentPrice, report.technical.fiftyTwoWeekLow, report.technical.fiftyTwoWeekHigh);

    const changePositive = report.changePercent !== null ? report.changePercent >= 0 : null;

    // Dynamic "back" target — reflects the screen the user arrived from (?from=…).
    const from = searchParams.get("from") || "";
    const backTargets: Record<string, { label: string; href: string }> = {
        terminal: { label: "Terminal", href: "/stocks/terminal" },
        stock: { label: report.symbol, href: `/stocks/${(report.symbol || "").toLowerCase()}` },
        stocks: { label: "Market Explorer", href: "/stocks" },
        watchlist: { label: "Watchlist", href: "/watchlist" },
    };
    const back = backTargets[from] || null;
    const goBack = () => { if (back) router.push(back.href); else router.back(); };

    return (
        <>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; color: black !important; font-size: 11px; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .print-break { page-break-before: always; }
                    .report-grid-2 { grid-template-columns: 1fr 1fr !important; }
                    .report-grid-3 { grid-template-columns: 1fr 1fr 1fr !important; }
                }
            `}</style>

            <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0a] text-zinc-900 dark:text-white">

                {/* ── Action bar ── */}
                <div className="no-print sticky top-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 pl-16 pr-4 sm:pr-8 lg:pl-8 py-3 pt-[calc(0.75rem_+_var(--sa-top))] flex items-center justify-between gap-3">
                    <button
                        onClick={goBack}
                        title={back ? `Back to ${back.label}` : "Go back"}
                        className="group flex items-center gap-2 min-w-0 shrink pl-1.5 pr-3 sm:pr-3.5 py-1.5 rounded-full bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 transition-all"
                    >
                        <span className="w-6 h-6 rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm text-zinc-600 dark:text-zinc-300 group-hover:-translate-x-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all">
                            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
                        </span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                            <span className="hidden sm:inline">Back to </span>{back ? back.label : "Back"}
                        </span>
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex gap-1 items-center shrink-0">
                            {report.dataSources.psx && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded font-bold whitespace-nowrap">PSX <Check className="w-3 h-3" strokeWidth={3} /></span>}
                            {report.dataSources.yahoo && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded font-bold whitespace-nowrap">Yahoo <Check className="w-3 h-3" strokeWidth={3} /></span>}
                        </div>
                        <span className="text-[11px] text-zinc-400 hidden sm:block">
                            {new Date(report.generatedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <button
                            onClick={() => window.print()}
                            aria-label="Download PDF"
                            title="Download PDF"
                            className="flex items-center gap-2 shrink-0 px-3 xs:px-4 py-2 min-h-[36px] bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-blue-600/20"
                        >
                            <Download className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                            <span className="hidden xs:inline">Download PDF</span>
                        </button>
                    </div>
                </div>

                <div ref={printRef} className="w-full px-4 py-6 lg:px-8 lg:py-8 space-y-4">

                    {/* ══ HEADER ══ */}
                    <div className="card p-4 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
                            <div className="flex items-center gap-3 sm:gap-4 min-w-0 w-full sm:w-auto">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center text-white font-black text-lg sm:text-xl shadow-lg shadow-blue-500/30 shrink-0">
                                    {report.symbol.substring(0, 2)}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h1 className="text-xl sm:text-3xl font-black uppercase tracking-tight break-words">{report.name}</h1>
                                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest rounded border border-blue-200 dark:border-blue-800">
                                            {report.exchange}: {report.symbol}
                                        </span>
                                    </div>
                                    <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 uppercase tracking-widest">
                                        {report.sector}{report.industry ? ` • ${report.industry}` : ""} — Equity Research Report
                                    </p>
                                </div>
                            </div>

                            {/* Phones get a 2-up grid so the figures line up in columns
                                instead of wrapping into a ragged row. */}
                            <div className="w-full sm:w-auto grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-6 sm:flex-wrap">
                                <div className="min-w-0">
                                    <p className="text-[10px] text-zinc-400 uppercase tracking-widest mb-0.5">Current Price</p>
                                    <p className="text-xl sm:text-2xl font-black font-mono">{fmtPrice(report.currentPrice, currency)}</p>
                                    {report.changePercent !== null && (
                                        <p className={`text-[11px] font-bold ${changePositive ? "text-green-500" : "text-red-500"}`}>
                                            {changePositive ? "▲" : "▼"} {fmt(Math.abs(report.changePercent ?? 0), 2)}%
                                            {report.change !== null ? ` (${fmtPrice(report.change)})` : ""}
                                        </p>
                                    )}
                                </div>
                                {report.targetPrice !== null && (
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest mb-0.5">12-Mo Target</p>
                                        <p className="text-xl sm:text-2xl font-black font-mono text-blue-500">{fmtPrice(report.targetPrice, currency)}</p>
                                    </div>
                                )}
                                {report.upsidePotential !== null && (
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest mb-0.5">Upside</p>
                                        <p className={`text-xl sm:text-2xl font-black ${report.upsidePotential >= 0 ? "text-green-500" : "text-red-500"}`}>
                                            {report.upsidePotential >= 0 ? "+" : ""}{fmt(report.upsidePotential, 1)}%
                                        </p>
                                    </div>
                                )}
                                {report.marketCap !== null && (
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest mb-0.5">Market Cap</p>
                                        <p className="text-base sm:text-lg font-black font-mono">{fmtLarge(report.marketCap, currency)}</p>
                                    </div>
                                )}
                                <div className={`col-span-2 sm:col-auto px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl border-2 font-black text-xl sm:text-2xl text-center ${ratingStyle}`}>
                                    {report.rating}
                                </div>
                            </div>
                        </div>

                        {/* 52-week range bar */}
                        {rangePosition !== null && (
                            <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                <div className="flex justify-between gap-2 text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-widest">
                                    <span className="min-w-0">52W Low: {fmtPrice(report.technical.fiftyTwoWeekLow, currency)}</span>
                                    <span className="hidden sm:inline shrink-0">52-Week Range Position</span>
                                    <span className="min-w-0 text-right">52W High: {fmtPrice(report.technical.fiftyTwoWeekHigh, currency)}</span>
                                </div>
                                <div className="relative h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full">
                                    <div
                                        className="h-2 bg-gradient-to-r from-red-400 via-amber-400 to-green-500 rounded-full"
                                        style={{ width: `${rangePosition}%` }}
                                    />
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-blue-500 shadow"
                                        style={{ left: `calc(${rangePosition}% - 6px)` }}
                                    />
                                </div>
                                <p className="text-center text-[10px] text-zinc-400 mt-1">{fmt(rangePosition, 0)}% of annual range</p>
                            </div>
                        )}
                    </div>

                    {/* ══ ROW 1: Company Snapshot + Today's Market Stats ══ */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 report-grid-2 gap-4">

                        {/* 1 — Company Snapshot */}
                        <Card glossaryTerms={["52-Week High", "52-Week Low", "Market Cap", "Volume"]}>
                            <SectionTitle num={1} label="Company Snapshot" />
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                                {report.description
                                    ? report.description.substring(0, 480) + (report.description.length > 480 ? "…" : "")
                                    : `${report.name} (${report.exchange}: ${report.symbol}) is a publicly listed company${report.sector ? ` in the ${report.sector} sector` : ""}. No company description available from data source.`}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: "Sector", val: report.sector || "—", raw: report.sector },
                                    { label: "Industry", val: report.industry || "—", raw: report.industry },
                                    { label: "Exchange", val: report.exchange, raw: report.exchange },
                                    { label: "Currency", val: currency, raw: currency },
                                    { label: "Market Cap", val: fmtLarge(report.marketCap, currency), raw: report.marketCap },
                                    { label: "Volume", val: fmtLarge(report.volume), raw: report.volume },
                                    { label: "52W High", val: fmtPrice(report.technical.fiftyTwoWeekHigh, currency), raw: report.technical.fiftyTwoWeekHigh },
                                    { label: "52W Low", val: fmtPrice(report.technical.fiftyTwoWeekLow, currency), raw: report.technical.fiftyTwoWeekLow },
                                    { label: "Day High", val: fmtPrice(report.technical.dayHigh, currency), raw: report.technical.dayHigh },
                                    { label: "Day Low", val: fmtPrice(report.technical.dayLow, currency), raw: report.technical.dayLow },
                                    { label: "LDCP", val: fmtPrice(report.technical.ldcp, currency), raw: report.technical.ldcp },
                                    { label: "Shares Out", val: fmtLarge(report.financials.sharesOutstanding), raw: report.financials.sharesOutstanding },
                                ].map((item) => (
                                    <div key={item.label} className={`rounded-xl p-3 ${item.raw === null || item.raw === undefined || item.raw === "" ? "bg-zinc-50 dark:bg-zinc-800/30 opacity-60" : "bg-zinc-50 dark:bg-zinc-800/60"}`}>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">{item.label}</p>
                                        <p className={`text-[11px] font-bold truncate ${item.raw === null || item.raw === undefined || item.raw === "" ? "text-zinc-400 italic" : "text-zinc-900 dark:text-white"}`}>
                                            {item.val === "—" ? "Not fetched" : item.val}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* 2 — Financial Snapshot */}
                        <Card glossaryTerms={["Revenue", "Operating Income", "Net Income (PAT)", "Free Cash Flow", "Total Assets", "Total Equity"]}>
                            <SectionTitle num={2} label="Financial Snapshot (Latest Fiscal Year)" />
                            <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                                        <th className="text-left text-[10px] font-black uppercase tracking-widest text-zinc-400 pb-2">Metric</th>
                                        <th className="text-right text-[10px] font-black uppercase tracking-widest text-zinc-400 pb-2">Amount ({currency})</th>
                                        <th className="text-right text-[10px] font-black uppercase tracking-widest text-zinc-400 pb-2 pl-2">Source</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { label: "Revenue", val: fmtLarge(report.financials.revenue), raw: report.financials.revenue },
                                        { label: "Operating Income", val: fmtLarge(report.financials.operatingIncome), raw: report.financials.operatingIncome },
                                        { label: "Net Income (PAT)", val: fmtLarge(report.financials.netIncome), raw: report.financials.netIncome },
                                        { label: "Total Assets", val: fmtLarge(report.financials.totalAssets), raw: report.financials.totalAssets },
                                        { label: "Total Equity", val: fmtLarge(report.financials.totalEquity), raw: report.financials.totalEquity },
                                        { label: "Free Cash Flow", val: fmtLarge(report.financials.fcf), raw: report.financials.fcf },
                                        { label: "Shares Outstanding", val: fmtLarge(report.financials.sharesOutstanding), raw: report.financials.sharesOutstanding },
                                    ].map((row) => (
                                        <tr key={row.label} className={`border-b border-zinc-50 dark:border-zinc-800/50 ${row.raw === null ? "opacity-50" : ""}`}>
                                            <td className="py-2.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400">{row.label}</td>
                                            <td className={`py-2.5 text-xs font-black text-right font-mono ${row.raw === null ? "text-zinc-400 italic" : "text-zinc-900 dark:text-white"}`}>
                                                {row.raw === null ? "Not available" : row.val}
                                            </td>
                                            <td className="py-2.5 text-right pl-2">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${row.raw !== null ? "bg-green-100 dark:bg-green-900/30 text-green-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"}`}>
                                                    {row.raw !== null ? (report.dataSources.yahoo ? "YF" : "PSX") : "—"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        </Card>
                    </div>

                    {/* ══ ROW 2: Trend + Key Metrics ══ */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 report-grid-2 gap-4">

                        {/* 3 — Financial Trend */}
                        <Card>
                            <SectionTitle num={3} label="Financial Performance Trend (Revenue & Net Income)" />
                            {chartData.filter(d => d.Revenue !== null).length > 1 ? (
                                <>
                                    <ResponsiveContainer width="100%" height={210}>
                                        <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.08)" />
                                            <XAxis dataKey="year" tick={{ fontSize: 10, fontWeight: 700 }} />
                                            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => v + "B"} />
                                            <Tooltip
                                                formatter={(v: any) => [v + "B"]}
                                                contentStyle={{ fontSize: 11, fontWeight: 700, borderRadius: 12 }}
                                            />
                                            <Bar dataKey="Revenue" radius={[5, 5, 0, 0]} maxBarSize={40}>
                                                {chartData.map((_, i) => (
                                                    <Cell key={i} fill={`rgba(59,130,246,${0.4 + (i / chartData.length) * 0.6})`} />
                                                ))}
                                            </Bar>
                                            <Line dataKey="Net Income" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981" }} activeDot={{ r: 5 }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                    <div className="flex gap-4 mt-1">
                                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500 opacity-80" /><span className="text-[11px] text-zinc-500">Revenue (B)</span></div>
                                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-[11px] text-zinc-500">Net Income (B)</span></div>
                                    </div>
                                </>
                            ) : (
                                <div className="h-[210px] flex flex-col items-center justify-center text-zinc-400 gap-2">
                                    <TrendingDown className="w-8 h-8" strokeWidth={2} />
                                    <p className="text-xs text-center">Historical financial data not available from data sources.</p>
                                    <p className="text-[11px] text-zinc-300 dark:text-zinc-600 text-center">PSX financials appear in the table below if available.</p>
                                </div>
                            )}
                        </Card>

                        {/* 4 — Key Metrics */}
                        <Card glossaryTerms={["Gross Margin", "Operating Margin", "Net Profit Margin", "Return on Equity", "P/E (TTM)", "Forward P/E", "EV / EBITDA", "Price / Book", "EPS (TTM)", "Beta (vs Market)", "Debt / Equity", "Book Value / Share", "Quick Ratio", "Current Ratio", "Dividend Yield"]}>
                            <SectionTitle num={4} label="Key Financial Metrics (LTM)" />
                            {/* One column on phones — two 150px columns leave no room
                                between a wrapped label and the next column's value. */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                                {[
                                    { label: "Gross Margin", val: fmtPct(report.metrics.grossMargin), raw: report.metrics.grossMargin },
                                    { label: "Operating Margin", val: fmtPct(report.metrics.operatingMargin), raw: report.metrics.operatingMargin },
                                    { label: "Net Profit Margin", val: fmtPct(report.metrics.netMargin), raw: report.metrics.netMargin },
                                    { label: "Return on Equity", val: fmtPct(report.metrics.roe), raw: report.metrics.roe },
                                    { label: "P/E (TTM)", val: report.metrics.pe !== null ? fmt(report.metrics.pe) + "x" : "—", raw: report.metrics.pe },
                                    { label: "Forward P/E", val: report.metrics.forwardPE !== null ? fmt(report.metrics.forwardPE) + "x" : "—", raw: report.metrics.forwardPE },
                                    { label: "EV / EBITDA", val: report.metrics.evEbitda !== null ? fmt(report.metrics.evEbitda) + "x" : "—", raw: report.metrics.evEbitda },
                                    { label: "Price / Book", val: report.metrics.pb !== null ? fmt(report.metrics.pb) + "x" : "—", raw: report.metrics.pb },
                                    { label: "EPS (TTM)", val: fmtPrice(report.metrics.eps, currency), raw: report.metrics.eps },
                                    { label: "Beta (vs Market)", val: report.metrics.beta !== null ? fmt(report.metrics.beta) : "—", raw: report.metrics.beta },
                                    { label: "Debt / Equity", val: report.metrics.debtToEquity !== null ? fmt(report.metrics.debtToEquity) + "%" : "—", raw: report.metrics.debtToEquity },
                                    { label: "Book Value / Share", val: fmtPrice(report.metrics.bookValuePerShare, currency), raw: report.metrics.bookValuePerShare },
                                    { label: "Quick Ratio", val: report.metrics.quickRatio !== null ? fmt(report.metrics.quickRatio) : "—", raw: report.metrics.quickRatio },
                                    { label: "Current Ratio", val: report.metrics.currentRatio !== null ? fmt(report.metrics.currentRatio) : "—", raw: report.metrics.currentRatio },
                                    { label: "Dividend Yield", val: fmtPct(report.metrics.dividendYield), raw: report.metrics.dividendYield },
                                ].map((item) => (
                                    <div key={item.label} className={`flex justify-between items-center gap-3 py-1.5 border-b border-zinc-50 dark:border-zinc-800/50 ${item.raw === null ? "opacity-50" : ""}`}>
                                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 min-w-0">{item.label}</span>
                                        <span className={`text-[11px] font-black font-mono shrink-0 ${item.raw === null ? "text-zinc-400 italic" : "text-zinc-900 dark:text-white"}`}>
                                            {item.val === "—" ? "N/A*" : item.val}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-2">* N/A = not available from Yahoo Finance or PSX for this ticker</p>
                        </Card>
                    </div>

                    {/* ══ ROW 3: Valuation + Risk + Moat ══ */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 report-grid-3 gap-4">

                        {/* 5 — Valuation */}
                        <Card glossaryTerms={["P/E (TTM)", "Forward P/E", "EV / EBITDA", "Price / Book", "Upside Potential"]}>
                            <SectionTitle num={5} label="Valuation Summary" />
                            <div className="space-y-2">
                                {[
                                    { label: "P/E (TTM)", val: report.metrics.pe !== null ? fmt(report.metrics.pe) + "x" : null, accent: true },
                                    { label: "Forward P/E", val: report.metrics.forwardPE !== null ? fmt(report.metrics.forwardPE) + "x" : null },
                                    { label: "EV / EBITDA", val: report.metrics.evEbitda !== null ? fmt(report.metrics.evEbitda) + "x" : null },
                                    { label: "Price / Book", val: report.metrics.pb !== null ? fmt(report.metrics.pb) + "x" : null },
                                    { label: "Dividend Yield", val: report.metrics.dividendYield !== null ? fmtPct(report.metrics.dividendYield) : null },
                                ].map((row) => (
                                    <div key={row.label} className={`flex justify-between items-center px-3 py-2.5 rounded-xl ${row.accent ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" : "bg-zinc-50 dark:bg-zinc-800/60"} ${row.val === null ? "opacity-50" : ""}`}>
                                        <span className={`text-xs font-bold ${row.accent ? "text-blue-600 dark:text-blue-400" : "text-zinc-600 dark:text-zinc-400"}`}>{row.label}</span>
                                        <span className={`text-sm font-black ${row.val === null ? "text-zinc-400 italic text-xs" : row.accent ? "text-blue-700 dark:text-blue-300" : "text-zinc-900 dark:text-white"}`}>
                                            {row.val ?? "Not available"}
                                        </span>
                                    </div>
                                ))}

                                {report.targetLow !== null && report.targetHigh !== null && (
                                    <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-green-600 mb-1">Analyst Fair Value Range</p>
                                        <p className="text-sm font-black text-green-700 dark:text-green-300">
                                            {fmtPrice(report.targetLow, currency)} – {fmtPrice(report.targetHigh, currency)}
                                        </p>
                                    </div>
                                )}

                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Valuation Stance</p>
                                    <p className={`text-sm font-black ${report.metrics.pe !== null && report.metrics.pe < 12 ? "text-green-600" : report.metrics.pe !== null && report.metrics.pe > 25 ? "text-red-600" : "text-amber-600"}`}>
                                        {report.metrics.pe === null
                                            ? "INSUFFICIENT DATA"
                                            : report.metrics.pe < 12 ? "UNDERVALUED"
                                            : report.metrics.pe > 25 ? "OVERVALUED"
                                            : "FAIRLY VALUED"}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        {/* 6 — Risk Analysis */}
                        <Card>
                            <SectionTitle num={6} label="Risk Analysis" color="text-red-500" />
                            <div className="space-y-1.5">
                                {risks.map((risk, i) => (
                                    <div key={i} className="flex items-start gap-2 p-2 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                                        <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0 mt-0.5">
                                            <span className="text-white text-[10px] font-black">{i + 1}</span>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black text-red-700 dark:text-red-400 leading-tight">{risk.title}</p>
                                            <p className="text-[10px] text-red-500 dark:text-red-500/70 leading-snug">{risk.detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* 7 — Moat + Industry */}
                        <Card>
                            <SectionTitle num={7} label="Competitive Moat" color="text-green-500" />
                            <div className="space-y-2 mb-4">
                                {moat.map((point, i) => (
                                    <div key={i} className="flex items-start gap-2 p-2 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30">
                                        <Check className="w-4 h-4 text-green-500 mt-0.5" strokeWidth={3} />
                                        <p className="text-[11px] font-semibold text-green-700 dark:text-green-400 leading-snug">{point}</p>
                                    </div>
                                ))}
                            </div>
                            <SectionTitle num={8} label="Industry Trends" color="text-purple-500" />
                            <div className="space-y-1.5">
                                {[
                                    "Digital transformation driving sector-wide efficiency gains",
                                    "Consolidation trends creating scale advantages for leaders",
                                    "ESG and sustainability requirements reshaping capital allocation",
                                    "Interest rate cycle impact on sector multiples",
                                ].map((t, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <span className="text-purple-400 font-black text-sm leading-none mt-0.5">•</span>
                                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">{t}</p>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {/* ══ ROW 4: Price Plan + Technical + Analysts ══ */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 report-grid-3 gap-4">

                        {/* 9 — Price Plan */}
                        <Card glossaryTerms={["Entry Zone", "Stop Loss", "Support Level", "Resistance Level", "Upside Potential"]}>
                            <SectionTitle num={9} label="Price Targets & Trading Plan" />
                            <div className="space-y-2">
                                {report.pricePlan.entryLow !== null ? (
                                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-0.5">Entry Zone</p>
                                        <p className="text-sm font-black text-blue-700 dark:text-blue-300">
                                            {fmtPrice(report.pricePlan.entryLow, currency)} – {fmtPrice(report.pricePlan.entryHigh, currency)}
                                        </p>
                                    </div>
                                ) : null}
                                {report.pricePlan.stopLoss !== null ? (
                                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-0.5">Stop Loss (−12%)</p>
                                        <p className="text-sm font-black text-red-700 dark:text-red-300">{fmtPrice(report.pricePlan.stopLoss, currency)}</p>
                                    </div>
                                ) : null}
                                {[
                                    { label: "Target 1 — Conservative (+10%)", val: report.pricePlan.target1 },
                                    { label: "Target 2 — Base Case (+20%)", val: report.pricePlan.target2 },
                                    { label: "Target 3 — Bull Case (+35%)", val: report.pricePlan.target3 },
                                ].map((t) =>
                                    t.val !== null ? (
                                        <div key={t.label} className="p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-green-600 mb-0.5">{t.label}</p>
                                            <p className="text-sm font-black text-green-700 dark:text-green-300">{fmtPrice(t.val, currency)}</p>
                                        </div>
                                    ) : null
                                )}
                                {report.technical.support.length > 0 && (
                                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">Key Support Levels</p>
                                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                            {report.technical.support.map(v => fmtPrice(v, currency)).join(" | ")}
                                        </p>
                                    </div>
                                )}
                                {report.technical.resistance.length > 0 && (
                                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">Key Resistance Levels</p>
                                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                            {report.technical.resistance.map(v => fmtPrice(v, currency)).join(" | ")}
                                        </p>
                                    </div>
                                )}
                                {report.currentPrice === null && (
                                    <p className="text-[11px] text-zinc-400 italic">Price data not available — targets cannot be calculated</p>
                                )}
                            </div>
                        </Card>

                        {/* 10 — Technical Outlook */}
                        <Card glossaryTerms={["50-Day Moving Avg", "200-Day Moving Avg", "52-Week High", "52-Week Low", "Day Range", "LDCP", "Support Level", "Resistance Level"]}>
                            <SectionTitle num={10} label="Technical Outlook" color="text-indigo-500" />
                            <div className={`p-4 rounded-2xl mb-4 text-center border-2 ${sigStyle}`}>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Overall Signal</p>
                                <p className="text-3xl font-black">{report.technical.signal}</p>
                                <p className="text-[10px] font-bold opacity-70 mt-1">{report.technical.trend}</p>
                            </div>
                            <div className="space-y-1.5">
                                {[
                                    { label: "Day High", val: fmtPrice(report.technical.dayHigh, currency), raw: report.technical.dayHigh },
                                    { label: "Day Low", val: fmtPrice(report.technical.dayLow, currency), raw: report.technical.dayLow },
                                    { label: "LDCP", val: fmtPrice(report.technical.ldcp, currency), raw: report.technical.ldcp },
                                    { label: "52-Week High", val: fmtPrice(report.technical.fiftyTwoWeekHigh, currency), raw: report.technical.fiftyTwoWeekHigh },
                                    { label: "52-Week Low", val: fmtPrice(report.technical.fiftyTwoWeekLow, currency), raw: report.technical.fiftyTwoWeekLow },
                                    { label: "50-Day MA", val: fmtPrice(report.technical.fiftyDayAvg, currency), raw: report.technical.fiftyDayAvg },
                                    { label: "200-Day MA", val: fmtPrice(report.technical.twoHundredDayAvg, currency), raw: report.technical.twoHundredDayAvg },
                                ].map((item) => (
                                    <div key={item.label} className={`flex justify-between items-center py-1.5 border-b border-zinc-50 dark:border-zinc-800/50 ${item.raw === null ? "opacity-40" : ""}`}>
                                        <span className="text-[11px] text-zinc-500">{item.label}</span>
                                        <span className={`text-[11px] font-black font-mono ${item.raw === null ? "text-zinc-400 italic" : "text-zinc-900 dark:text-white"}`}>
                                            {item.raw === null ? "N/A" : item.val}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {(report.technical.fiftyDayAvg === null && report.technical.twoHundredDayAvg === null) && (
                                <p className="text-[10px] text-zinc-400 mt-2 italic">Moving averages not available from PSX — signal based on LDCP comparison</p>
                            )}
                        </Card>

                        {/* 11 — Analyst Consensus + Bull/Bear */}
                        <Card glossaryTerms={["Upside Potential"]}>
                            <SectionTitle num={11} label="Analyst Consensus" color="text-amber-500" />
                            {report.analysts.total > 0 ? (
                                <>
                                    <div className="space-y-2 mb-4">
                                        {[
                                            { label: "Strong Buy", val: report.analysts.strongBuy, color: "bg-green-600" },
                                            { label: "Buy", val: report.analysts.buy, color: "bg-green-400" },
                                            { label: "Hold", val: report.analysts.hold, color: "bg-amber-400" },
                                            { label: "Sell", val: report.analysts.sell, color: "bg-red-400" },
                                            { label: "Strong Sell", val: report.analysts.strongSell, color: "bg-red-600" },
                                        ].map((item) => (
                                            <div key={item.label} className="flex items-center gap-2">
                                                <span className="text-[11px] w-20 text-zinc-500 shrink-0">{item.label}</span>
                                                <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                                                    <div className={`${item.color} h-2 rounded-full`} style={{ width: `${(item.val / report.analysts.total) * 100}%` }} />
                                                </div>
                                                <span className="text-[11px] font-black w-4 text-right">{item.val}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl text-center">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Consensus ({report.analysts.total} analysts)</p>
                                        <p className={`text-lg font-black ${ratingStyle.split(" ")[0]}`}>{report.rating}</p>
                                        {report.analysts.recMean !== null && (
                                            <p className="text-[10px] text-zinc-400 mt-0.5">Mean score: {fmt(report.analysts.recMean)} / 5.0</p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-28 text-zinc-400 gap-2 mb-2">
                                    <Search className="w-8 h-8" strokeWidth={2} />
                                    <p className="text-xs text-center">Analyst coverage not available — PSX stocks are typically not covered by Yahoo analyst ratings.</p>
                                    <p className="text-[10px] text-center text-zinc-300 dark:text-zinc-600">Rating derived from technical signal instead.</p>
                                </div>
                            )}

                            {/* Bull vs Bear — dynamic from actual data */}
                            <div className="mt-3">
                                <SectionTitle num={12} label="Bull vs Bear" color="text-zinc-500" />
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-2 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-200 dark:border-green-900/30">
                                        <p className="text-[10px] font-black uppercase text-green-600 mb-1 inline-flex items-center gap-1"><TrendingUp className="w-3 h-3" strokeWidth={2} /> Bull Case</p>
                                        {[
                                            report.metrics.operatingMargin !== null && report.metrics.operatingMargin > 0.1
                                                ? `Strong ${fmtPct(report.metrics.operatingMargin)} op. margin`
                                                : "Potential margin expansion",
                                            report.upsidePotential !== null && report.upsidePotential > 0
                                                ? `+${fmt(report.upsidePotential, 0)}% upside to target`
                                                : "Recovery from recent low",
                                            report.metrics.roe !== null && report.metrics.roe > 0.12
                                                ? `${fmtPct(report.metrics.roe)} ROE efficiency`
                                                : "Sector tailwinds",
                                        ].map((b, i) => (
                                            <p key={i} className="text-[10px] text-green-700 dark:text-green-400">• {b}</p>
                                        ))}
                                    </div>
                                    <div className="p-2 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/30">
                                        <p className="text-[10px] font-black uppercase text-red-600 mb-1 inline-flex items-center gap-1"><TrendingDown className="w-3 h-3" strokeWidth={2} /> Bear Case</p>
                                        {[
                                            report.metrics.debtToEquity !== null && report.metrics.debtToEquity > 100
                                                ? `High D/E ${fmt(report.metrics.debtToEquity, 0)}%`
                                                : "Macro headwinds",
                                            report.metrics.beta !== null && report.metrics.beta > 1.2
                                                ? `High beta ${fmt(report.metrics.beta)} volatility`
                                                : "Sector competition",
                                            report.metrics.pe !== null && report.metrics.pe > 20
                                                ? `Rich P/E of ${fmt(report.metrics.pe)}x`
                                                : "Margin compression risk",
                                        ].map((b, i) => (
                                            <p key={i} className="text-[10px] text-red-700 dark:text-red-400">• {b}</p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* ══ PSX Historical Financials ══ */}
                    {psxRows.length > 0 && psxYears.length > 0 && (
                        <Card>
                            <SectionTitle label={`PSX Historical Financials — ${exchange}: ${report.symbol}`} color="text-blue-500" />
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-zinc-100 dark:border-zinc-800">
                                            <th className="text-left text-[10px] font-black uppercase tracking-widest text-zinc-400 pb-2 pr-4 min-w-[160px]">Metric</th>
                                            {psxYears.map((y) => (
                                                <th key={y} className="text-right text-[10px] font-black uppercase tracking-widest text-zinc-400 pb-2 px-3">{y}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {psxRows.map((row, i) => (
                                            <tr key={i} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                                <td className="py-2 pr-4 font-semibold text-zinc-600 dark:text-zinc-400 text-[11px]">{row.label}</td>
                                                {row.values.map((v, j) => (
                                                    <td key={j} className={`py-2 px-3 text-right font-mono font-black text-[11px] ${v ? "text-zinc-900 dark:text-white" : "text-zinc-400"}`}>
                                                        {v || "—"}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {/* ══ FINAL VERDICT ══ */}
                    <div className="bg-white dark:bg-zinc-900 border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-4 sm:p-6">
                        {/* Stacked on phones: side by side, the rating block refuses to
                            shrink and squeezes the scorecard into an unreadable column. */}
                        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-start justify-between gap-4 sm:gap-6">
                            <div className="w-full sm:w-auto sm:flex-1 sm:min-w-[280px] order-2 sm:order-none">
                                <SectionTitle num={13} label="Final Verdict — Composite Scorecard" />
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                                    {[
                                        { label: "Business Quality", score: scores.businessQuality, key: "Business Quality" },
                                        { label: "Financial Health", score: scores.financialHealth, key: "Financial Health" },
                                        { label: "Valuation", score: scores.valuation, key: "Valuation" },
                                        { label: "Growth Potential", score: scores.growthPotential, key: "Growth Potential" },
                                        { label: "Technical Picture", score: scores.technicalPicture, key: "Technical Picture" },
                                    ].map((item) => (
                                        <ScoreItem key={item.label} label={item.label} score={item.score} glossaryKey={item.key} />
                                    ))}
                                </div>
                                <div className="mt-4 text-[11px] text-zinc-500 space-y-0.5">
                                    <p>Overall composite: {((scores.businessQuality + scores.financialHealth + scores.valuation + scores.growthPotential + scores.technicalPicture) / 5).toFixed(1)} / 5.0</p>
                                    <p>Based on: operating margins, debt levels, P/E, revenue CAGR, and price trend</p>
                                </div>
                            </div>
                            <div className={`w-full sm:w-auto px-5 sm:px-8 py-4 sm:py-5 rounded-2xl border-2 text-center shrink-0 order-1 sm:order-none ${ratingStyle}`}>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Final Rating</p>
                                <p className="text-3xl sm:text-4xl font-black">{report.rating}</p>
                                <p className="text-[10px] opacity-60 mt-1">FOR PATIENT INVESTORS (2–3 YR)</p>
                                {report.upsidePotential !== null && (
                                    <p className="text-[10px] font-bold mt-2">{report.upsidePotential >= 0 ? "+" : ""}{fmt(report.upsidePotential, 1)}% to target</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-5 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                            <p className="text-[10px] text-zinc-400 leading-relaxed">
<AlertTriangle className="inline w-3 h-3 mr-0.5 -mt-0.5 text-amber-500" strokeWidth={2} /> <strong>Disclaimer:</strong> This report is auto-generated using publicly available financial data (Yahoo Finance, PSX) and is for educational purposes only.
                                Values showing "N/A", "—", or "Not available" were not returned by the data source for this ticker.
                                This does not constitute financial advice. Always consult a licensed financial advisor before investing.
                                Past performance does not guarantee future results.
                            </p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center py-4 no-print">
                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest">
                            {report.exchange}: {report.symbol} • {new Date(report.generatedAt).toLocaleString()} •
                            Data: {[report.dataSources.psx && "PSX", report.dataSources.yahoo && "Yahoo Finance"].filter(Boolean).join(" + ") || "No sources"}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Page entry point (wraps with Suspense for useSearchParams) ───────────────

export default async function StockReportPage({ params }: { params: Promise<{ symbol: string }> }) {
    const { symbol } = await params;
    const sym = symbol.toUpperCase();
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <ReportContent symbol={sym} />
        </Suspense>
    );
}
