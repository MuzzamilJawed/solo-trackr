"use client";

import { useCurrency } from "../context/CurrencyContext";
import { currencySymbol as symbolFor, rateOf } from "../lib/currency";
import FitText from "./FitText";
import { PILL, TEXT, TRI, direction } from "../lib/change";

interface PriceCardProps {
  title: string;
  usdPrice?: number;
  pkrPrice?: number;
  /** Day change, denominated in USD (converted alongside the price). */
  change?: number;
  changePercent?: number;
  lastUpdated: string;
  isLoading?: boolean;
  error?: string;
  /** Pin the card to one currency (e.g. a NASDAQ holding). Defaults to the
   *  active display currency. */
  currency?: string;
}

export default function PriceCard({
  title,
  usdPrice,
  pkrPrice,
  change = 0,
  changePercent = 0,
  lastUpdated,
  isLoading = false,
  error,
  currency,
}: PriceCardProps) {
  const { currency: active, rates } = useCurrency();
  const code = currency ?? active;

  const isPositive = (changePercent || 0) >= 0;
  const dir = direction(changePercent);
  // Prefer the feed's own implied USD→PKR rate so PKR figures match the source.
  const impliedPkr = (pkrPrice && usdPrice) ? pkrPrice / usdPrice : rateOf(rates, 'PKR');
  const factor = code === 'USD' ? 1 : code === 'PKR' ? impliedPkr : rateOf(rates, code);
  const usdBase = usdPrice ?? (pkrPrice != null ? pkrPrice / impliedPkr : undefined);
  const displayPrice = code === 'PKR' ? (pkrPrice ?? (usdBase != null ? usdBase * factor : undefined))
    : (usdBase != null ? usdBase * factor : undefined);
  const displayChange = change * factor;
  const currencySymbol = symbolFor(code);

  return (
    <div className="card group h-full flex flex-col p-4 sm:p-6 hover:shadow-2xl transition-all duration-500 relative overflow-hidden">
      {/* Decorative background element */}
      <div className={`absolute top-0 right-0 w-32 h-32 opacity-[0.03] dark:opacity-[0.05] rounded-bl-full translate-x-12 -translate-y-12 transition-transform duration-700 group-hover:scale-150 ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}></div>

      <div className="relative z-10 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-3 sm:mb-6">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-xl font-black text-zinc-900 dark:text-zinc-50 tracking-tighter uppercase italic leading-tight">
              {title}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full animate-pulse ${dir === "flat" ? 'bg-zinc-400' : isPositive ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Live</span>
            </div>
          </div>
          {!isLoading && !error && (
            <div className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-tighter ${PILL[dir]}`}>
              {TRI[dir]} {Math.abs(changePercent).toFixed(2)}%
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="h-12 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-2xl w-full"></div>
            <div className="h-4 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-lg w-2/3"></div>
          </div>
        ) : error ? (
          <div className="py-8 text-center bg-red-50/50 dark:bg-red-900/10 rounded-3xl border border-red-100/50 dark:border-red-900/20">
            <p className="text-red-500 text-xs font-black uppercase tracking-widest">Connection Interrupted</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4 flex-1 flex flex-col">
            <div>
              <div className="flex items-baseline gap-1.5 sm:gap-2 min-w-0">
                <span className="text-base sm:text-xl font-medium text-zinc-400 shrink-0">{currencySymbol}</span>
                <FitText className="flex-1 text-xl sm:text-2xl lg:text-3xl font-black text-zinc-900 dark:text-zinc-50 tracking-tighter font-mono tabular-nums">
                  {(displayPrice || 0).toLocaleString(undefined, {
                    minimumFractionDigits: (displayPrice || 0) < 10 ? 4 : 2,
                    maximumFractionDigits: (displayPrice || 0) < 10 ? 4 : 2
                  })}
                </FitText>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <p className={`text-sm font-black italic tracking-tight ${TEXT[direction(displayChange, 4)]}`}>
                  {displayChange > 0 ? '+' : ''}
                  {(displayChange || 0).toLocaleString(undefined, {
                    minimumFractionDigits: (displayPrice || 0) < 10 ? 4 : 2,
                    maximumFractionDigits: (displayPrice || 0) < 10 ? 4 : 2
                  })}
                </p>
                {/* <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Since Open</span> */}
              </div>
            </div>

            {/* Footer hidden on mobile to keep cards short (time is in the page header) */}
            {/* <div className="mt-auto pt-3 sm:pt-6 border-t border-zinc-100 dark:border-zinc-800 hidden sm:flex justify-between items-center">
              <div className="space-y-0.5">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Market Refresh</p>
                <p className="text-[11px] font-bold text-zinc-900 dark:text-zinc-50">{lastUpdated}</p>
              </div>
            </div> */}
          </div>
        )}
      </div>
    </div>
  );
}
