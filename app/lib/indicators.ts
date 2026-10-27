// Technical indicators — pure functions over OHLCV candles, no dependencies.
//
// Every series function returns an array the SAME LENGTH as its input, with
// `null` where there isn't enough history yet (the "warm-up" period), so results
// line up index-for-index with the candles they were computed from.
//
// Conventions follow the standard textbook / Wilder definitions:
//   RSI(14), ATR(14), ADX(14)  — Wilder's smoothing
//   MACD(12,26,9)              — EMA based
//   Bollinger(20, 2σ)          — population standard deviation
//   Stochastic(14,3)           — slow %K / %D

export interface Candle {
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export type Series = (number | null)[];

const nulls = (n: number): Series => new Array<number | null>(n).fill(null);

export const last = <T>(a: T[]): T | undefined => a[a.length - 1];

/** Latest non-null value of a series. */
export const lastValue = (s: Series): number | null => {
    for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i];
    return null;
};

// ── Moving averages ─────────────────────────────────────────────────────────

export function sma(values: number[], period: number): Series {
    const out = nulls(values.length);
    if (period <= 0 || values.length < period) return out;
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) out[i] = sum / period;
    }
    return out;
}

/** EMA seeded with the SMA of the first `period` values (the usual convention). */
export function ema(values: number[], period: number): Series {
    const out = nulls(values.length);
    if (period <= 0 || values.length < period) return out;
    const k = 2 / (period + 1);
    let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

// ── Momentum ────────────────────────────────────────────────────────────────

/** Wilder's RSI. 100 when there have been no losses, 0 when no gains. */
export function rsi(closes: number[], period = 14): Series {
    const out = nulls(closes.length);
    if (closes.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
        const d = closes[i] - closes[i - 1];
        if (d >= 0) gain += d; else loss -= d;
    }
    let avgGain = gain / period, avgLoss = loss / period;
    const toRsi = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
    out[period] = toRsi();
    for (let i = period + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
        out[i] = toRsi();
    }
    return out;
}

export interface MacdResult { macd: Series; signal: Series; histogram: Series }

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
    const f = ema(closes, fast), s = ema(closes, slow);
    const line = closes.map((_, i) => (f[i] != null && s[i] != null ? (f[i] as number) - (s[i] as number) : null));
    // Signal = EMA of the MACD line, computed over its defined part only.
    const start = line.findIndex(v => v != null);
    const signal = nulls(closes.length);
    if (start >= 0) {
        const defined = line.slice(start) as number[];
        const sig = ema(defined, signalPeriod);
        sig.forEach((v, i) => { signal[start + i] = v; });
    }
    const histogram = line.map((v, i) => (v != null && signal[i] != null ? v - (signal[i] as number) : null));
    return { macd: line, signal, histogram };
}

export interface StochResult { k: Series; d: Series }

/** Slow stochastic: raw %K over `period`, smoothed by `smoothK`; %D smooths %K again. */
export function stochastic(candles: Candle[], period = 14, smoothK = 3, smoothD = 3): StochResult {
    const n = candles.length;
    const raw = nulls(n);
    for (let i = period - 1; i < n; i++) {
        let hh = -Infinity, ll = Infinity;
        for (let j = i - period + 1; j <= i; j++) { hh = Math.max(hh, candles[j].high); ll = Math.min(ll, candles[j].low); }
        raw[i] = hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100;
    }
    const smooth = (src: Series, p: number): Series => {
        const o = nulls(n);
        const start = src.findIndex(v => v != null);
        if (start < 0) return o;
        const sm = sma(src.slice(start) as number[], p);
        sm.forEach((v, i) => { o[start + i] = v; });
        return o;
    };
    const k = smooth(raw, smoothK);
    return { k, d: smooth(k, smoothD) };
}

/** Rate of change over `period` bars, in percent. */
export function roc(closes: number[], period: number): Series {
    return closes.map((c, i) => (i >= period && closes[i - period] !== 0 ? ((c - closes[i - period]) / closes[i - period]) * 100 : null));
}

// ── Volatility ──────────────────────────────────────────────────────────────

export function trueRange(candles: Candle[]): number[] {
    return candles.map((c, i) => {
        if (i === 0) return c.high - c.low;
        const pc = candles[i - 1].close;
        return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    });
}

/** Wilder's ATR. */
export function atr(candles: Candle[], period = 14): Series {
    const out = nulls(candles.length);
    if (candles.length < period) return out;
    const tr = trueRange(candles);
    let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = prev;
    for (let i = period; i < candles.length; i++) {
        prev = (prev * (period - 1) + tr[i]) / period;
        out[i] = prev;
    }
    return out;
}

export interface BollingerResult { mid: Series; upper: Series; lower: Series; percentB: Series; bandwidth: Series }

export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult {
    const n = closes.length;
    const mid = sma(closes, period);
    const upper = nulls(n), lower = nulls(n), percentB = nulls(n), bandwidth = nulls(n);
    for (let i = period - 1; i < n; i++) {
        const m = mid[i] as number;
        let v = 0;
        for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) ** 2;
        const sd = Math.sqrt(v / period);
        upper[i] = m + mult * sd;
        lower[i] = m - mult * sd;
        const width = (upper[i] as number) - (lower[i] as number);
        percentB[i] = width === 0 ? 0.5 : (closes[i] - (lower[i] as number)) / width;
        bandwidth[i] = m !== 0 ? width / m : null;
    }
    return { mid, upper, lower, percentB, bandwidth };
}

// ── Trend strength ──────────────────────────────────────────────────────────

export interface AdxResult { adx: Series; plusDI: Series; minusDI: Series }

/** Wilder's ADX with +DI / -DI. ADX > 25 ≈ a real trend; < 20 ≈ ranging. */
export function adx(candles: Candle[], period = 14): AdxResult {
    const n = candles.length;
    const adxS = nulls(n), pdi = nulls(n), mdi = nulls(n);
    if (n <= period * 2) return { adx: adxS, plusDI: pdi, minusDI: mdi };

    const tr = trueRange(candles);
    const pdm = new Array<number>(n).fill(0), mdm = new Array<number>(n).fill(0);
    for (let i = 1; i < n; i++) {
        const up = candles[i].high - candles[i - 1].high;
        const down = candles[i - 1].low - candles[i].low;
        pdm[i] = up > down && up > 0 ? up : 0;
        mdm[i] = down > up && down > 0 ? down : 0;
    }

    // Wilder-smoothed sums, seeded with the first `period` values (indices 1..period).
    let sTR = 0, sP = 0, sM = 0;
    for (let i = 1; i <= period; i++) { sTR += tr[i]; sP += pdm[i]; sM += mdm[i]; }
    const dx: number[] = [];
    const push = (i: number) => {
        const p = sTR === 0 ? 0 : (100 * sP) / sTR;
        const m = sTR === 0 ? 0 : (100 * sM) / sTR;
        pdi[i] = p; mdi[i] = m;
        dx.push(p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m));
    };
    push(period);
    for (let i = period + 1; i < n; i++) {
        sTR = sTR - sTR / period + tr[i];
        sP = sP - sP / period + pdm[i];
        sM = sM - sM / period + mdm[i];
        push(i);
    }
    // dx[0] belongs to index `period`; first ADX is the mean of the first `period` DX values.
    let a = dx.slice(0, period).reduce((x, y) => x + y, 0) / period;
    adxS[period * 2 - 1] = a;
    for (let i = period; i < dx.length; i++) {
        a = (a * (period - 1) + dx[i]) / period;
        adxS[period + i] = a;
    }
    return { adx: adxS, plusDI: pdi, minusDI: mdi };
}

// ── Volume ──────────────────────────────────────────────────────────────────

export function obv(candles: Candle[]): number[] {
    const out: number[] = [];
    let total = 0;
    candles.forEach((c, i) => {
        if (i > 0) {
            const pc = candles[i - 1].close;
            if (c.close > pc) total += c.volume;
            else if (c.close < pc) total -= c.volume;
        }
        out.push(total);
    });
    return out;
}

// ── Levels ──────────────────────────────────────────────────────────────────

export interface FibLevel { ratio: number; label: string; price: number }

export interface Fibonacci {
    /** "up": the swing ran low→high, so retracements are pullbacks from the high. */
    direction: "up" | "down";
    swingHigh: { price: number; index: number };
    swingLow: { price: number; index: number };
    retracements: FibLevel[];
    extensions: FibLevel[];
}

const RETRACE = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const EXTEND = [1.272, 1.618];

/**
 * Fibonacci levels from the dominant swing in the last `lookback` bars.
 * The swing runs between the highest high and lowest low in that window; its
 * direction is whichever extreme came LATER (a high after a low = up-swing).
 * Retracement levels are measured back from the end of the swing; extensions
 * project beyond it.
 */
export function fibonacci(candles: Candle[], lookback = 120): Fibonacci | null {
    if (candles.length < 10) return null;
    const start = Math.max(0, candles.length - lookback);
    let hi = { price: -Infinity, index: start }, lo = { price: Infinity, index: start };
    for (let i = start; i < candles.length; i++) {
        if (candles[i].high > hi.price) hi = { price: candles[i].high, index: i };
        if (candles[i].low < lo.price) lo = { price: candles[i].low, index: i };
    }
    const range = hi.price - lo.price;
    if (!(range > 0)) return null;

    const up = hi.index > lo.index;
    // Up-swing: level = high - ratio*range. Down-swing: level = low + ratio*range.
    const at = (r: number) => (up ? hi.price - r * range : lo.price + r * range);
    const ext = (r: number) => (up ? lo.price + r * range : hi.price - r * range);
    const label = (r: number) => `${(r * 100).toFixed(r * 100 % 1 === 0 ? 0 : 1)}%`;
    return {
        direction: up ? "up" : "down",
        swingHigh: hi,
        swingLow: lo,
        retracements: RETRACE.map(r => ({ ratio: r, label: label(r), price: at(r) })),
        extensions: EXTEND.map(r => ({ ratio: r, label: label(r), price: ext(r) })),
    };
}

export interface Pivots { pivot: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number }

/** Classic floor-trader pivots from one bar's high/low/close. */
export function pivotPoints(h: number, l: number, c: number): Pivots {
    const p = (h + l + c) / 3;
    return { pivot: p, r1: 2 * p - l, s1: 2 * p - h, r2: p + (h - l), s2: p - (h - l), r3: h + 2 * (p - l), s3: l - 2 * (h - p) };
}

/**
 * Support/resistance from swing points: a bar whose high (low) is the highest
 * (lowest) within `wing` bars each side. Nearby swings (within `tolerance`) are
 * merged into one level; levels with more touches are stronger.
 */
export interface SrLevel { price: number; touches: number }

export function supportResistance(candles: Candle[], wing = 5, tolerance = 0.015): { support: SrLevel[]; resistance: SrLevel[] } {
    const highs: number[] = [], lows: number[] = [];
    for (let i = wing; i < candles.length - wing; i++) {
        let isHigh = true, isLow = true;
        for (let j = i - wing; j <= i + wing; j++) {
            if (j === i) continue;
            if (candles[j].high >= candles[i].high) isHigh = false;
            if (candles[j].low <= candles[i].low) isLow = false;
        }
        if (isHigh) highs.push(candles[i].high);
        if (isLow) lows.push(candles[i].low);
    }
    const cluster = (pts: number[]): SrLevel[] => {
        const sorted = [...pts].sort((a, b) => a - b);
        const groups: number[][] = [];
        for (const p of sorted) {
            const g = groups[groups.length - 1];
            if (g && (p - g[0]) / g[0] <= tolerance) g.push(p); else groups.push([p]);
        }
        return groups.map(g => ({ price: g.reduce((a, b) => a + b, 0) / g.length, touches: g.length }));
    };
    const price = candles[candles.length - 1]?.close ?? 0;
    const all = cluster([...highs, ...lows]);
    return {
        support: all.filter(l => l.price < price).sort((a, b) => b.price - a.price),
        resistance: all.filter(l => l.price >= price).sort((a, b) => a.price - b.price),
    };
}
