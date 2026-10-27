// Turns a stock's daily candles into a technical read: indicator values, plain-
// English signals, Fibonacci/pivot/support levels and an overall Buy / Hold /
// Sell lean with the reasons behind it.
//
// This is a rules-based summary of price action — NOT a forecast and NOT advice.
// Indicators lag, disagree with each other, and say nothing about earnings,
// news, or liquidity. The verdict is only as good as the 6–12 months of history
// behind it, and PSX stocks can also gap or lock at the ±7.5% circuit limits.

import {
    adx, atr, bollinger, ema, fibonacci, lastValue, macd, obv, pivotPoints, roc, rsi, sma, stochastic,
    supportResistance, type Candle, type Fibonacci, type Pivots, type Series, type SrLevel,
} from "./indicators";

export type Lean = "bullish" | "bearish" | "neutral";
export type Group = "Trend" | "Momentum" | "Volatility" | "Volume" | "Levels";

export interface Signal {
    id: string;
    group: Group;
    name: string;
    /** The reading, formatted for display ("RSI 62.4"). */
    value: string;
    lean: Lean;
    /** -2 (strongly bearish) … +2 (strongly bullish). */
    score: number;
    weight: number;
    /** One plain-English sentence on what it means. */
    note: string;
}

export type VerdictLabel = "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
export type Confidence = "High" | "Medium" | "Low";

export interface Verdict {
    label: VerdictLabel;
    /** -100 (all indicators bearish) … +100 (all bullish). */
    score: number;
    confidence: Confidence;
    bullish: number;
    bearish: number;
    neutral: number;
}

export interface TradePlan {
    /** Reference stop: price ∓ 2×ATR. Not a recommendation — a volatility-based marker. */
    stop: number;
    stopPct: number;
    targets: { label: string; price: number; pct: number }[];
    /** Reward ÷ risk to the first target, when there is one. */
    riskReward: number | null;
    side: "long" | "short-bias";
}

export interface Analysis {
    asOf: string | number;
    bars: number;
    price: number;
    changePct: number | null;
    verdict: Verdict;
    signals: Signal[];
    groups: { group: Group; score: number; lean: Lean }[];
    caveats: string[];
    plan: TradePlan | null;
    fib: Fibonacci | null;
    pivots: Pivots | null;
    support: SrLevel[];
    resistance: SrLevel[];
    range52: { high: number; low: number; positionPct: number } | null;
    values: {
        rsi: number | null; macd: number | null; macdSignal: number | null; macdHist: number | null;
        stochK: number | null; stochD: number | null; adx: number | null; plusDI: number | null; minusDI: number | null;
        atr: number | null; atrPct: number | null; sma20: number | null; sma50: number | null; sma200: number | null;
        ema12: number | null; ema26: number | null; bbUpper: number | null; bbMid: number | null; bbLower: number | null;
        percentB: number | null; roc63: number | null; volumeRatio: number | null;
    };
    /** Full series for charting, aligned with the candles. */
    series: { sma20: Series; sma50: Series; sma200: Series; rsi: Series; macd: Series; macdSignal: Series; macdHist: Series; bbUpper: Series; bbLower: Series };
}

const MIN_BARS = 30;
const fmt = (n: number | null, d = 2) => (n == null ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const leanOf = (score: number): Lean => (score > 0.25 ? "bullish" : score < -0.25 ? "bearish" : "neutral");

export function analyze(candles: Candle[]): Analysis | null {
    const c = candles.filter(k => Number.isFinite(k.close) && Number.isFinite(k.high) && Number.isFinite(k.low));
    if (c.length < MIN_BARS) return null;

    const closes = c.map(k => k.close);
    const n = c.length;
    const price = closes[n - 1];
    const prev = closes[n - 2];
    const changePct = prev ? ((price - prev) / prev) * 100 : null;

    const sma20 = sma(closes, 20), sma50 = sma(closes, 50), sma200 = sma(closes, 200);
    const ema12 = ema(closes, 12), ema26 = ema(closes, 26);
    const rsiS = rsi(closes, 14);
    const m = macd(closes);
    const bb = bollinger(closes, 20, 2);
    const st = stochastic(c);
    const atrS = atr(c, 14);
    const adxR = adx(c, 14);
    const obvS = obv(c);
    const roc63 = roc(closes, 63);

    const v = {
        rsi: lastValue(rsiS), macd: lastValue(m.macd), macdSignal: lastValue(m.signal), macdHist: lastValue(m.histogram),
        stochK: lastValue(st.k), stochD: lastValue(st.d), adx: lastValue(adxR.adx), plusDI: lastValue(adxR.plusDI), minusDI: lastValue(adxR.minusDI),
        atr: lastValue(atrS), atrPct: null as number | null,
        sma20: lastValue(sma20), sma50: lastValue(sma50), sma200: lastValue(sma200), ema12: lastValue(ema12), ema26: lastValue(ema26),
        bbUpper: lastValue(bb.upper), bbMid: lastValue(bb.mid), bbLower: lastValue(bb.lower), percentB: lastValue(bb.percentB),
        roc63: lastValue(roc63), volumeRatio: null as number | null,
    };
    v.atrPct = v.atr != null ? (v.atr / price) * 100 : null;

    const recentVol = c.slice(-21, -1).map(k => k.volume).filter(x => x > 0);
    const avgVol = recentVol.length ? recentVol.reduce((a, b) => a + b, 0) / recentVol.length : 0;
    v.volumeRatio = avgVol > 0 ? c[n - 1].volume / avgVol : null;

    const signals: Signal[] = [];
    const add = (s: Omit<Signal, "lean">) => signals.push({ ...s, lean: leanOf(s.score) });

    // ── Trend ────────────────────────────────────────────────────────────────
    if (v.sma50 != null) {
        const above = price > v.sma50;
        add({ id: "sma50", group: "Trend", name: "Price vs 50-day average", value: `${fmt(price)} vs ${fmt(v.sma50)}`, score: above ? 1 : -1, weight: 1,
            note: above ? "Trading above its 50-day average — the medium-term trend is up." : "Trading below its 50-day average — the medium-term trend is down." });
    }
    if (v.sma200 != null) {
        const above = price > v.sma200;
        add({ id: "sma200", group: "Trend", name: "Price vs 200-day average", value: `${fmt(price)} vs ${fmt(v.sma200)}`, score: above ? 1 : -1, weight: 1.25,
            note: above ? "Above the 200-day average — the long-term trend is up." : "Below the 200-day average — the long-term trend is down." });
    }
    if (v.sma50 != null && v.sma200 != null) {
        const golden = v.sma50 > v.sma200;
        // Did the 50/200 relationship flip in the last 10 bars?
        let crossed = false;
        for (let i = Math.max(1, n - 10); i < n; i++) {
            const a0 = sma50[i - 1], b0 = sma200[i - 1], a1 = sma50[i], b1 = sma200[i];
            if (a0 != null && b0 != null && a1 != null && b1 != null && (a0 > b0) !== (a1 > b1)) crossed = true;
        }
        add({ id: "cross", group: "Trend", name: "50/200-day crossover", value: golden ? "50 above 200" : "50 below 200", score: crossed ? (golden ? 2 : -2) : golden ? 1 : -1, weight: 1,
            note: crossed ? (golden ? "A golden cross formed in the last 2 weeks — a classic long-term bullish signal." : "A death cross formed in the last 2 weeks — a classic long-term bearish signal.")
                : golden ? "The 50-day average is above the 200-day (golden-cross state)." : "The 50-day average is below the 200-day (death-cross state)." });
    }
    if (v.ema12 != null && v.ema26 != null) {
        const up = v.ema12 > v.ema26;
        add({ id: "ema", group: "Trend", name: "12/26-day EMA", value: `${fmt(v.ema12)} / ${fmt(v.ema26)}`, score: up ? 1 : -1, weight: 1,
            note: up ? "The faster average is above the slower one — short-term momentum is up." : "The faster average is below the slower one — short-term momentum is down." });
    }
    if (v.adx != null && v.plusDI != null && v.minusDI != null) {
        const dir = v.plusDI > v.minusDI ? 1 : -1;
        const strength = v.adx >= 40 ? 2 : v.adx >= 25 ? 1 : 0;
        add({ id: "adx", group: "Trend", name: "Trend strength (ADX)", value: `ADX ${fmt(v.adx, 1)}`, score: dir * strength, weight: 1,
            note: strength === 0 ? "ADX is below 25: there is no clear trend, so trend signals are less reliable (choppy / range-bound)."
                : `ADX ${fmt(v.adx, 1)} shows a ${v.adx >= 40 ? "very strong" : "solid"} ${dir > 0 ? "up" : "down"}trend.` });
    }

    // ── Momentum ─────────────────────────────────────────────────────────────
    if (v.rsi != null) {
        const r = v.rsi;
        const score = r >= 70 ? -1 : r >= 55 ? 1 : r > 45 ? 0 : r >= 30 ? -0.5 : 1.5;
        add({ id: "rsi", group: "Momentum", name: "RSI (14)", value: fmt(r, 1), score, weight: 1.25,
            note: r >= 70 ? "Overbought (≥70): the rally is stretched and a pullback is more likely, though strong trends can stay overbought."
                : r >= 55 ? "Bullish momentum (55–70) without being stretched."
                : r > 45 ? "Neutral (45–55): neither buyers nor sellers are in control."
                : r >= 30 ? "Weak momentum (30–45): sellers have the upper hand."
                : "Oversold (<30): heavily sold, so a bounce is possible — but in a downtrend it can keep falling." });
    }
    if (v.macd != null && v.macdSignal != null && v.macdHist != null) {
        const h = m.histogram;
        const hPrev = h[n - 2];
        const rising = hPrev != null ? v.macdHist > hPrev : false;
        let flipped = false;
        for (let i = Math.max(1, n - 3); i < n; i++) { const a = h[i - 1], b = h[i]; if (a != null && b != null && (a > 0) !== (b > 0)) flipped = true; }
        const score = flipped ? (v.macdHist > 0 ? 2 : -2) : v.macdHist > 0 ? (rising ? 1.5 : 0.5) : (rising ? -0.5 : -1.5);
        add({ id: "macd", group: "Momentum", name: "MACD (12,26,9)", value: `${fmt(v.macd)} vs ${fmt(v.macdSignal)}`, score, weight: 1.25,
            note: flipped ? (v.macdHist > 0 ? "MACD just crossed above its signal line — a fresh bullish momentum signal." : "MACD just crossed below its signal line — a fresh bearish momentum signal.")
                : v.macdHist > 0 ? (rising ? "MACD is above its signal line and strengthening." : "MACD is above its signal line but losing steam.")
                : (rising ? "MACD is below its signal line but recovering." : "MACD is below its signal line and weakening.") });
    }
    if (v.stochK != null && v.stochD != null) {
        const k = v.stochK, d = v.stochD;
        const score = k < 20 && k > d ? 1.5 : k > 80 && k < d ? -1.5 : k > d ? 0.5 : -0.5;
        add({ id: "stoch", group: "Momentum", name: "Stochastic (14,3)", value: `%K ${fmt(k, 1)} / %D ${fmt(d, 1)}`, score, weight: 0.75,
            note: k < 20 && k > d ? "Turning up from oversold territory — an early buy-side signal."
                : k > 80 && k < d ? "Turning down from overbought territory — an early sell-side signal."
                : k > 80 ? "In overbought territory (>80)." : k < 20 ? "In oversold territory (<20)."
                : k > d ? "%K is above %D: short-term momentum is positive." : "%K is below %D: short-term momentum is negative." });
    }
    if (v.roc63 != null) {
        const r = v.roc63;
        add({ id: "roc", group: "Momentum", name: "3-month return", value: `${r >= 0 ? "+" : ""}${fmt(r, 1)}%`, score: r > 10 ? 1 : r < -10 ? -1 : 0, weight: 0.75,
            note: r > 10 ? "Up more than 10% over about three months — strong positive momentum." : r < -10 ? "Down more than 10% over about three months — persistent selling." : "Little change over about three months." });
    }

    // ── Volatility / position in the bands ───────────────────────────────────
    if (v.percentB != null) {
        const b = v.percentB;
        const score = b < 0 ? 1.5 : b > 1 ? -1.5 : b < 0.2 ? 0.5 : b > 0.8 ? -0.5 : 0;
        add({ id: "bb", group: "Volatility", name: "Bollinger Bands (20,2)", value: `%B ${fmt(b)}`, score, weight: 0.75,
            note: b < 0 ? "Price is below the lower band — statistically stretched to the downside (bounce candidate)."
                : b > 1 ? "Price is above the upper band — statistically stretched to the upside (pullback risk)."
                : b < 0.2 ? "Near the lower band." : b > 0.8 ? "Near the upper band." : "Trading in the middle of its normal range." });
    }

    // ── Volume ───────────────────────────────────────────────────────────────
    if (n > 25) {
        const slope = obvS[n - 1] - obvS[n - 21];
        const volScale = Math.max(1, c.slice(-20).reduce((a, k) => a + k.volume, 0));
        const strong = Math.abs(slope) / volScale > 0.1;
        add({ id: "obv", group: "Volume", name: "On-balance volume (20d)", value: slope >= 0 ? "Rising" : "Falling", score: strong ? (slope > 0 ? 1 : -1) : 0, weight: 0.75,
            note: !strong ? "Volume flow is balanced — no clear accumulation or distribution."
                : slope > 0 ? "Volume has been flowing in on up-days: buyers are accumulating." : "Volume has been flowing out on down-days: sellers are distributing." });
    }
    if (v.volumeRatio != null && changePct != null) {
        const spike = v.volumeRatio >= 1.5;
        add({ id: "vol", group: "Volume", name: "Today's volume vs 20-day avg", value: `${fmt(v.volumeRatio, 1)}×`, score: spike ? (changePct > 0 ? 1 : changePct < 0 ? -1 : 0) : 0, weight: 0.5,
            note: spike ? (changePct > 0 ? "Heavy volume on an up-day — the move has conviction." : changePct < 0 ? "Heavy volume on a down-day — the move has conviction." : "Heavy volume with no price change.")
                : "Volume is ordinary, so today's move carries little extra information." });
    }

    // ── Levels ───────────────────────────────────────────────────────────────
    const sr = supportResistance(c, 5, 0.015);
    const nearestSup = sr.support[0], nearestRes = sr.resistance[0];
    const fib = fibonacci(c, Math.min(120, n));
    const pivots = n >= 2 ? pivotPoints(c[n - 2].high, c[n - 2].low, c[n - 2].close) : null;
    if (nearestSup || nearestRes) {
        const dSup = nearestSup ? ((price - nearestSup.price) / price) * 100 : Infinity;
        const dRes = nearestRes ? ((nearestRes.price - price) / price) * 100 : Infinity;
        let score = 0, note = "Not close to a major support or resistance level.";
        if (dSup <= 3 && dSup < dRes) { score = 1; note = `Sitting just ${fmt(dSup, 1)}% above support at ${fmt(nearestSup!.price)} — a favourable spot to buy against, with a clear level to be wrong at.`; }
        else if (dRes <= 3) { score = -1; note = `Only ${fmt(dRes, 1)}% below resistance at ${fmt(nearestRes!.price)} — upside may stall here.`; }
        add({ id: "sr", group: "Levels", name: "Nearest support / resistance", value: `${nearestSup ? fmt(nearestSup.price) : "—"} / ${nearestRes ? fmt(nearestRes.price) : "—"}`, score, weight: 0.75, note });
    }

    // 52-week position (informational context, not scored)
    const yr = c.slice(-252);
    const range52 = yr.length >= 60
        ? (() => {
            const high = Math.max(...yr.map(k => k.high)), low = Math.min(...yr.map(k => k.low));
            return { high, low, positionPct: high > low ? ((price - low) / (high - low)) * 100 : 50 };
        })()
        : null;

    // ── Aggregate ────────────────────────────────────────────────────────────
    const maxW = signals.reduce((a, s) => a + 2 * s.weight, 0);
    const raw = signals.reduce((a, s) => a + s.score * s.weight, 0);
    const score = maxW > 0 ? Math.round((raw / maxW) * 100) : 0;
    const label: VerdictLabel = score >= 45 ? "Strong Buy" : score >= 15 ? "Buy" : score <= -45 ? "Strong Sell" : score <= -15 ? "Sell" : "Hold";

    const bullish = signals.filter(s => s.lean === "bullish").length;
    const bearish = signals.filter(s => s.lean === "bearish").length;
    const neutral = signals.length - bullish - bearish;
    const agree = score >= 0 ? bullish : bearish;
    const agreement = signals.length ? agree / signals.length : 0;
    let confidence: Confidence = agreement >= 0.7 && label !== "Hold" ? "High" : agreement >= 0.5 ? "Medium" : "Low";
    const caveats: string[] = [];
    if (n < 200) { if (confidence === "High") confidence = "Medium"; caveats.push(`Only ${n} bars of history, so the 200-day average isn't available and long-term signals are missing.`); }
    if (n < 60) { confidence = "Low"; caveats.push("Very short history — treat this as a rough guide only."); }
    if (v.adx != null && v.adx < 20) caveats.push("The market is range-bound (ADX < 20): trend-following signals often whipsaw in ranges.");
    if (v.rsi != null && v.rsi >= 70 && score > 0) caveats.push("Bullish overall, but RSI is overbought — chasing here carries pullback risk.");
    if (v.rsi != null && v.rsi <= 30 && score < 0) caveats.push("Bearish overall, but RSI is oversold — selling here risks missing a bounce.");
    if (bullish > 0 && bearish > 0 && Math.min(bullish, bearish) / signals.length >= 0.3) caveats.push("Indicators are split — the mixed picture is why the verdict is not stronger.");
    caveats.push("PSX stocks can move up to ±7.5% in a day and some trade thinly, so gaps can jump past any stop level.");

    const groups = (["Trend", "Momentum", "Volatility", "Volume", "Levels"] as Group[])
        .map(g => {
            const list = signals.filter(s => s.group === g);
            const w = list.reduce((a, s) => a + 2 * s.weight, 0);
            const sc = w > 0 ? Math.round((list.reduce((a, s) => a + s.score * s.weight, 0) / w) * 100) : 0;
            return { group: g, score: sc, lean: leanOf(sc / 50), has: list.length > 0 };
        })
        .filter(g => g.has)
        .map(({ group, score: s, lean }) => ({ group, score: s, lean }));

    // ── Reference levels ─────────────────────────────────────────────────────
    let plan: TradePlan | null = null;
    if (v.atr != null) {
        const bullishBias = score >= 0;
        const stop = bullishBias ? price - 2 * v.atr : price + 2 * v.atr;
        const ups = [
            ...sr.resistance.map(l => ({ label: `Resistance ${fmt(l.price)}`, price: l.price })),
            ...(fib ? fib.extensions.filter(e => e.price > price).map(e => ({ label: `Fib ${e.label} extension`, price: e.price })) : []),
        ].filter(t => t.price > price).sort((a, b) => a.price - b.price).slice(0, 3);
        const downs = [...sr.support.map(l => ({ label: `Support ${fmt(l.price)}`, price: l.price }))].filter(t => t.price < price).sort((a, b) => b.price - a.price).slice(0, 3);
        const targets = (bullishBias ? ups : downs).map(t => ({ ...t, pct: ((t.price - price) / price) * 100 }));
        const risk = Math.abs(price - stop);
        plan = {
            stop, stopPct: ((stop - price) / price) * 100, targets,
            riskReward: targets.length && risk > 0 ? Math.abs(targets[0].price - price) / risk : null,
            side: bullishBias ? "long" : "short-bias",
        };
    }

    return {
        asOf: c[n - 1].time, bars: n, price, changePct,
        verdict: { label, score, confidence, bullish, bearish, neutral },
        signals, groups, caveats, plan, fib, pivots,
        support: sr.support.slice(0, 4), resistance: sr.resistance.slice(0, 4), range52, values: v,
        series: { sma20, sma50, sma200, rsi: rsiS, macd: m.macd, macdSignal: m.signal, macdHist: m.histogram, bbUpper: bb.upper, bbLower: bb.lower },
    };
}
