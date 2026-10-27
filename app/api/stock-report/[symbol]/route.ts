import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safe(val: any): any {
    if (val && typeof val === 'object' && 'raw' in val) return val.raw;
    if (val !== undefined && val !== null && !Number.isNaN(val)) return val;
    return null;
}

function parseNum(s: string | undefined | null): number | null {
    if (!s) return null;
    // First number in the string, so "Rs.49.40" gives 49.4 (not ".49.40" -> 0.49).
    const m = s.toString().replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    const n = m ? parseFloat(m[0]) : NaN;
    return isNaN(n) ? null : n;
}

// ─── Yahoo Finance (crumb-authenticated) ──────────────────────────────────────

const YAHOO_MODULES = [
    'assetProfile', 'financialData', 'defaultKeyStatistics', 'summaryDetail',
    'incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory',
    'recommendationTrend', 'price',
].join(',');

const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
    try {
        const homeRes = await fetch('https://finance.yahoo.com/', {
            headers: {
                'User-Agent': YAHOO_UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
        });
        const rawCookie = homeRes.headers.get('set-cookie') ?? '';
        const cookie = rawCookie.split(/,(?=[^ ])/).map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');

        const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
            headers: { 'User-Agent': YAHOO_UA, 'Cookie': cookie, 'Accept': '*/*', 'Referer': 'https://finance.yahoo.com/' },
        });
        const crumb = (await crumbRes.text()).trim();
        if (!crumb || crumb.startsWith('<') || crumb.length > 30) return null;
        return { crumb, cookie };
    } catch {
        return null;
    }
}

async function fetchYahooData(ticker: string): Promise<any> {
    try {
        const auth = await getYahooCrumb();
        const headers: Record<string, string> = { 'User-Agent': YAHOO_UA, 'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.9' };

        let url: string;
        if (auth) {
            headers['Cookie'] = auth.cookie;
            headers['Referer'] = `https://finance.yahoo.com/quote/${ticker}`;
            url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${YAHOO_MODULES}&crumb=${encodeURIComponent(auth.crumb)}`;
        } else {
            // Fallback: v8 (sometimes works without crumb)
            url = `https://query2.finance.yahoo.com/v8/finance/quoteSummary/${ticker}?modules=${YAHOO_MODULES}`;
        }

        const res = await fetch(url, { headers, next: { revalidate: 3600 } });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.quoteSummary?.result?.[0] ?? null;
    } catch {
        return null;
    }
}

// ─── PSX Detail scraper ───────────────────────────────────────────────────────

async function fetchPsxDetail(symbol: string): Promise<any> {
    try {
        const res = await fetch(`https://dps.psx.com.pk/company/${symbol}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Cache-Control': 'no-cache',
            },
            next: { revalidate: 3600 },
        });
        if (!res.ok) return null;

        const html = await res.text();
        const $ = cheerio.load(html);

        const stats: Record<string, string> = {};
        $('.stats_item').each((_, el) => {
            const label = $(el).find('.stats_label').text().trim().replace(/[\^*]/g, '').trim();
            const value = $(el).find('.stats_value').text().trim();
            if (label) stats[label] = value;
        });

        function getStat(keys: string[]): string | null {
            for (const k of keys) {
                const found = Object.keys(stats).find((sk) => sk.toLowerCase().includes(k.toLowerCase()));
                if (found) return stats[found];
            }
            return null;
        }

        const years: string[] = [];
        const rows: { label: string; values: string[] }[] = [];
        const finTable = $('#financialTab table').first();
        if (finTable.length) {
            finTable.find('thead tr th').each((_, th) => {
                const y = $(th).text().trim();
                if (y && !isNaN(Number(y))) years.push(y);
            });
            finTable.find('tbody tr').each((_, tr) => {
                const label = $(tr).find('th, td').first().text().trim();
                // The label cell is a <th> on some rows and a <td> on others. Only
                // skip the first <td> when it IS the label, otherwise the label got
                // pushed in as values[0] and every year's figure shifted a column.
                const labelIsTh = $(tr).find('th').length > 0;
                const values: string[] = [];
                $(tr).find('td').each((i, td) => {
                    if (labelIsTh || i > 0) values.push($(td).text().trim());
                });
                if (label) rows.push({ label, values });
            });
        }

        const yearRange = getStat(['52-WEEK RANGE', '52-WK RANGE', '52 Week Range', '52 Week']);
        let wk52High: number | null = null, wk52Low: number | null = null;
        if (yearRange) {
            const parts = yearRange.split(/[-–]/);
            if (parts.length === 2) { wk52Low = parseNum(parts[0]); wk52High = parseNum(parts[1]); }
        }

        const dayRange = getStat(['DAY RANGE', 'Day Range']);
        let dayHigh: number | null = null, dayLow: number | null = null;
        if (dayRange) {
            const parts = dayRange.split(/[-–]/);
            if (parts.length === 2) { dayLow = parseNum(parts[0]); dayHigh = parseNum(parts[1]); }
        }

        const rawDivYield = parseNum(getStat(['Div. Yield', 'Dividend Yield']));

        return {
            name: $('.company_name').text().trim() || null,
            sector: $('.company_sector').text().trim() || null,
            currentPrice: parseNum($('.quote__close').first().text().trim()) ?? parseNum($('.last').text().trim()),
            change: parseNum($('.change__value').first().text().trim()) ?? parseNum($('.change').text().trim()),
            changePercent: parseNum($('.change__percent').first().text().trim()) ?? parseNum($('.percentage').text().trim()),
            pe: parseNum(getStat(['P/E Ratio', 'PE Ratio', 'P/E'])),
            eps: parseNum(getStat(['EPS'])),
            beta: parseNum(getStat(['BETA', 'Beta'])),
            // PSX shows divYield as percent (e.g. 3.5 = 3.5%) — convert to decimal for consistency
            divYield: rawDivYield !== null ? rawDivYield / 100 : null,
            ldcp: parseNum(getStat(['LDCP'])),
            volume: parseNum(getStat(['Volume', 'VOL', 'Avg. Volume'])),
            marketCap: parseNum(getStat(['Market Cap', 'Mkt. Cap', 'Mkt Cap', 'M. Cap', 'MARKET CAP'])),
            bookValuePerShare: parseNum(getStat(['Book Value', 'Book Value/Share', 'BV/Share'])),
            wk52High, wk52Low, dayHigh, dayLow,
            stats,
            financialTable: { years, rows },
        };
    } catch {
        return null;
    }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
    request: Request,
    { params }: { params: Promise<{ symbol: string }> }
) {
    const { symbol } = await params;
    const sym = symbol.toUpperCase();
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get('exchange') || 'PSX';

    // Yahoo Finance ticker suffix per exchange
    const yahooTicker = exchange === 'PSX' ? `${sym}.KA` : sym;

    try {
        // ── Parallel: PSX (primary) + Yahoo (supplement) ─────────────────
        const [psxDetail, yahooData] = await Promise.all([
            exchange === 'PSX' ? fetchPsxDetail(sym) : Promise.resolve(null),
            fetchYahooData(yahooTicker),
        ]);

        // ── Yahoo sub-objects (all optional) ──────────────────────────────
        const profile        = yahooData?.assetProfile        ?? {};
        const yFinancial     = yahooData?.financialData        ?? {};
        const keyStats       = yahooData?.defaultKeyStatistics ?? {};
        const summaryDetail  = yahooData?.summaryDetail        ?? {};
        const incomeHistory  = yahooData?.incomeStatementHistory?.incomeStatementHistory  ?? [];
        const balanceHistory = yahooData?.balanceSheetHistory?.balanceSheetStatements     ?? [];
        const cashHistory    = yahooData?.cashflowStatementHistory?.cashflowStatements    ?? [];
        const priceData      = yahooData?.price                ?? {};
        const recTrend       = yahooData?.recommendationTrend?.trend ?? [];

        // ── Current price: PSX first, Yahoo fallback ──────────────────────
        const currentPrice: number | null =
            psxDetail?.currentPrice ??
            safe(priceData.regularMarketPrice) ??
            safe(yFinancial.currentPrice);

        const currency = exchange === 'PSX' ? 'PKR' : (safe(priceData.currency) ?? 'USD');

        // ── Company info ──────────────────────────────────────────────────
        const companyName =
            psxDetail?.name || safe(priceData.longName) || safe(priceData.shortName) || sym;
        const sector      = psxDetail?.sector || profile.sector || '';
        const industry    = profile.industry || '';
        const description = profile.longBusinessSummary || '';

        // ── Financials ────────────────────────────────────────────────────
        const latestIncome  = incomeHistory[0]  ?? {};
        const latestBalance = balanceHistory[0] ?? {};
        const latestCash    = cashHistory[0]    ?? {};

        const psxRows  = psxDetail?.financialTable?.rows  ?? [];
        const psxYears = psxDetail?.financialTable?.years ?? [];

        function psxRowVal(keywords: string[], colIndex = 0): number | null {
            const row = psxRows.find((r: any) =>
                keywords.some((k: string) => r.label.toLowerCase().includes(k.toLowerCase()))
            );
            return row?.values?.[colIndex] ? parseNum(row.values[colIndex]) : null;
        }

        // ── Compute PSX row values first (needed for fallbacks below) ────
        const psxRevenue0    = psxRowVal(['Sales', 'Revenue', 'Net Sales', 'Net Revenue']);
        const psxGrossProfit = psxRowVal(['Gross Profit']);
        const psxOpProfit    = psxRowVal(['Operating Profit', 'Profit from Operations', 'EBIT', 'Operating Income']);
        const psxPAT0        = psxRowVal(['Profit after Tax', 'PAT', 'Net Profit', 'Profit After Taxation', 'Profit / (Loss) after Tax']);
        const psxEquity0     = psxRowVal(['Total Equity', 'Shareholders Equity', "Stockholders' Equity", 'Equity', 'Total Shareholders']);
        const psxLiab0       = psxRowVal(['Total Liabilities', 'Total Liability', 'Total Liab']);
        const psxAssets0     = psxRowVal(['Total Assets']);

        const revenue         = safe(latestIncome.totalRevenue)      ?? psxRowVal(['Sales', 'Revenue', 'Net Sales']);
        const netIncome       = safe(latestIncome.netIncome)          ?? psxRowVal(['Profit after Tax', 'PAT', 'Net Profit', 'Profit After Taxation']);
        const operatingIncome = safe(latestIncome.operatingIncome)    ?? psxOpProfit;
        const totalAssets     = safe(latestBalance.totalAssets)       ?? psxAssets0;
        const totalEquity     = safe(latestBalance.totalStockholderEquity) ?? psxEquity0;
        const opsCashflow     = safe(latestCash.totalCashFromOperatingActivities);
        const capex           = safe(latestCash.capitalExpenditures);
        const fcf             = safe(latestCash.freeCashflow) ??
            (opsCashflow !== null && capex !== null ? opsCashflow + capex : null);

        let historicalRevenue: { year: string; revenue: number | null; netIncome: number | null }[] = [];
        if (incomeHistory.length > 0) {
            historicalRevenue = [...incomeHistory].reverse().map((s: any) => ({
                year: (s.endDate?.fmt as string | undefined)?.substring(0, 4) ?? '',
                revenue: safe(s.totalRevenue),
                netIncome: safe(s.netIncome),
            })).filter((h) => h.year);
        } else if (psxYears.length > 0) {
            const revRow = psxRows.find((r: any) => /sales|revenue|net sales/i.test(r.label));
            const niRow  = psxRows.find((r: any) => /profit after tax|pat|net profit/i.test(r.label));
            historicalRevenue = psxYears.map((y: string, i: number) => ({
                year: y,
                revenue:   revRow ? parseNum(revRow.values[i]) : null,
                netIncome: niRow  ? parseNum(niRow.values[i])  : null,
            }));
        }

        // ── Key metrics: PSX primary, Yahoo fallback ──────────────────────
        const pe              = psxDetail?.pe   ?? safe(summaryDetail.trailingPE);
        const eps             = psxDetail?.eps  ?? safe(keyStats.trailingEps);
        const beta            = psxDetail?.beta ?? safe(summaryDetail.beta);
        const forwardPE       = safe(summaryDetail.forwardPE);
        const evEbitda        = safe(keyStats.enterpriseToEbitda);
        const roe             = safe(yFinancial.returnOnEquity);
        const debtToEquity    = safe(yFinancial.debtToEquity);
        const grossMarginY    = safe(yFinancial.grossMargins);
        const operatingMarginY= safe(yFinancial.operatingMargins);
        const netMarginY      = safe(yFinancial.profitMargins);
        const pbY             = safe(summaryDetail.priceToBook);
        const sharesOut       = safe(keyStats.sharesOutstanding);
        const bookValue       = safe(keyStats.bookValue) ?? psxDetail?.bookValuePerShare ?? null;
        const quickRatio      = safe(yFinancial.quickRatio);
        const currentRatioV   = safe(yFinancial.currentRatio);
        const dividendYield   = psxDetail?.divYield ?? safe(summaryDetail.dividendYield) ?? safe(summaryDetail.trailingAnnualDividendYield);

        // ── Compute margins from PSX financial table when Yahoo is unavailable ───

        const computedGrossMargin  = psxGrossProfit !== null && psxRevenue0 !== null && psxRevenue0 !== 0
            ? psxGrossProfit / psxRevenue0 : null;
        const computedOpMargin     = psxOpProfit !== null && psxRevenue0 !== null && psxRevenue0 !== 0
            ? psxOpProfit / psxRevenue0 : null;
        const computedNetMargin    = psxPAT0 !== null && psxRevenue0 !== null && psxRevenue0 !== 0
            ? psxPAT0 / psxRevenue0 : null;
        const computedROE          = psxPAT0 !== null && psxEquity0 !== null && psxEquity0 !== 0
            ? psxPAT0 / psxEquity0 : null;
        const computedDE           = psxLiab0 !== null && psxEquity0 !== null && psxEquity0 !== 0
            ? (psxLiab0 / psxEquity0) * 100 : null;
        const computedPB           = currentPrice !== null && bookValue !== null && bookValue > 0
            ? currentPrice / bookValue : null;

        const grossMargin     = grossMarginY     ?? computedGrossMargin;
        const operatingMargin = operatingMarginY ?? computedOpMargin;
        const netMargin       = netMarginY       ?? computedNetMargin;
        const roeF            = roe              ?? computedROE;
        const debtToEquityF   = debtToEquity     ?? computedDE;
        const pb              = pbY              ?? computedPB;

        // ── Technical levels ──────────────────────────────────────────────
        const wk52High = psxDetail?.wk52High ?? safe(summaryDetail.fiftyTwoWeekHigh);
        const wk52Low  = psxDetail?.wk52Low  ?? safe(summaryDetail.fiftyTwoWeekLow);
        const ma50     = safe(summaryDetail.fiftyDayAverage);
        const ma200    = safe(summaryDetail.twoHundredDayAverage);

        let technicalTrend = 'NEUTRAL', technicalSignal = 'HOLD';
        if (currentPrice !== null && ma50 !== null && ma200 !== null) {
            if (currentPrice > ma50 && ma50 > ma200)      { technicalTrend = 'UPTREND';      technicalSignal = 'BUY';  }
            else if (currentPrice < ma50 && ma50 < ma200) { technicalTrend = 'DOWNTREND';    technicalSignal = 'SELL'; }
            else                                           { technicalTrend = 'CONSOLIDATION'; }
        } else if (currentPrice !== null && psxDetail?.ldcp !== null && psxDetail?.ldcp !== undefined) {
            const ldcp = psxDetail.ldcp as number;
            if (currentPrice > ldcp * 1.01)      { technicalTrend = 'UPTREND';   technicalSignal = 'BUY';  }
            else if (currentPrice < ldcp * 0.99) { technicalTrend = 'DOWNTREND'; technicalSignal = 'SELL'; }
        }

        const support    = wk52Low  !== null ? [+((wk52Low  * 1.02).toFixed(2)), +((wk52Low  * 1.05).toFixed(2))] : [];
        const resistance = wk52High !== null ? [+((wk52High * 0.93).toFixed(2)), +((wk52High * 0.97).toFixed(2))] : [];

        const entryLow  = currentPrice !== null ? +((currentPrice * 0.95).toFixed(2)) : null;
        const entryHigh = currentPrice !== null ? +((currentPrice * 1.00).toFixed(2)) : null;
        const stopLoss  = currentPrice !== null ? +((currentPrice * 0.88).toFixed(2)) : null;

        // ── Analyst consensus ─────────────────────────────────────────────
        const latest     = recTrend[0] ?? {};
        const strongBuy  = latest.strongBuy  ?? 0;
        const buy        = latest.buy        ?? 0;
        const hold       = latest.hold       ?? 0;
        const sell       = latest.sell       ?? 0;
        const strongSell = latest.strongSell ?? 0;
        const totalAnalysts = strongBuy + buy + hold + sell + strongSell;
        const recMean    = safe(keyStats.recommendationMean);

        let rating = 'HOLD';
        if (recMean !== null) {
            if (recMean <= 1.5)       rating = 'STRONG BUY';
            else if (recMean <= 2.5)  rating = 'BUY';
            else if (recMean <= 3.5)  rating = 'HOLD';
            else if (recMean <= 4.5)  rating = 'SELL';
            else                      rating = 'STRONG SELL';
        } else if (totalAnalysts > 0) {
            const bullRatio = (strongBuy + buy) / totalAnalysts;
            rating = bullRatio >= 0.6 ? 'BUY' : bullRatio >= 0.35 ? 'HOLD' : 'SELL';
        } else {
            rating = technicalSignal !== 'HOLD' ? technicalSignal : 'HOLD';
        }

        // ── Price targets ─────────────────────────────────────────────────
        const targetMean = safe(yFinancial.targetMeanPrice);
        const targetHigh = safe(yFinancial.targetHighPrice);
        const targetLow  = safe(yFinancial.targetLowPrice);
        const upside = targetMean !== null && currentPrice !== null
            ? ((targetMean - currentPrice) / currentPrice) * 100
            : (currentPrice !== null ? 20 : null);

        const derivedT1 = currentPrice !== null ? +((currentPrice * 1.10).toFixed(2)) : null;
        const derivedT2 = currentPrice !== null ? +((currentPrice * 1.20).toFixed(2)) : null;
        const derivedT3 = currentPrice !== null ? +((currentPrice * 1.35).toFixed(2)) : null;

        // ── Build report ──────────────────────────────────────────────────
        const report = {
            symbol: sym,
            exchange,
            name: companyName,
            sector,
            industry,
            description,
            currency,
            rating,

            currentPrice,
            targetPrice:      targetMean ?? derivedT2,
            targetHigh:       targetHigh ?? derivedT3,
            targetLow:        targetLow  ?? derivedT1,
            upsidePotential:  upside,

            financials: {
                revenue,
                operatingIncome,
                netIncome,
                totalAssets,
                totalEquity,
                fcf,
                sharesOutstanding: sharesOut,
                historicalRevenue,
            },

            metrics: {
                grossMargin,
                operatingMargin,
                netMargin,
                pe,
                forwardPE,
                evEbitda,
                pb,
                eps,
                roe:              roeF,
                debtToEquity:     debtToEquityF,
                beta,
                bookValuePerShare: bookValue,
                quickRatio,
                currentRatio:     currentRatioV,
                dividendYield,
            },

            technical: {
                trend: technicalTrend,
                signal: technicalSignal,
                fiftyTwoWeekHigh: wk52High,
                fiftyTwoWeekLow:  wk52Low,
                fiftyDayAvg:      ma50,
                twoHundredDayAvg: ma200,
                support,
                resistance,
                dayHigh: psxDetail?.dayHigh ?? null,
                dayLow:  psxDetail?.dayLow  ?? null,
                ldcp:    psxDetail?.ldcp    ?? null,
            },

            analysts: {
                strongBuy, buy, hold, sell, strongSell,
                total: totalAnalysts,
                recMean,
            },

            pricePlan: {
                entryLow,
                entryHigh,
                stopLoss,
                target1: targetLow  ?? derivedT1,
                target2: targetMean ?? derivedT2,
                target3: targetHigh ?? derivedT3,
            },

            change:        psxDetail?.change        ?? safe(priceData.regularMarketChange),
            changePercent: psxDetail?.changePercent  ?? safe(priceData.regularMarketChangePercent),
            volume:        psxDetail?.volume         ?? safe(priceData.regularMarketVolume),
            marketCap:     psxDetail?.marketCap      ?? safe(summaryDetail.marketCap),

            psxStats:      psxDetail?.stats          ?? null,
            psxFinancials: psxDetail?.financialTable ?? null,

            dataSources: { yahoo: yahooData !== null, psx: psxDetail !== null },
            generatedAt: new Date().toISOString(),
        };

        return NextResponse.json({ success: true, data: report });
    } catch (err: any) {
        console.error('stock-report error:', err);
        return NextResponse.json(
            { success: false, error: err.message ?? 'Unknown error' },
            { status: 500 }
        );
    }
}
