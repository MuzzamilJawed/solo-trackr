"use client";

import { useEffect, useState } from "react";
import { DEFAULT_RULES, loadRules, saveRules, type HoldingAlertRules } from "../lib/holdingAlertRules";

// Settings > Alert Settings: when should a stock you hold notify you? One rule set
// for every holding. Saved as you type.
export default function HoldingAlertThresholds() {
    const [rules, setRules] = useState<HoldingAlertRules>(DEFAULT_RULES);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRules(loadRules());
        setReady(true);
    }, []);

    const update = (patch: Partial<HoldingAlertRules>) => {
        const next = { ...rules, ...patch };
        setRules(next);
        saveRules(next);
    };
    const num = (v: string) => Math.max(0, Math.min(1000, parseFloat(v) || 0));

    if (!ready) return null;

    return (
        <div className="border-t border-zinc-100 dark:border-white/5 pt-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">Holding notifications</p>
                    <p className="text-xs text-zinc-500 mt-0.5">A pop-up when a stock you hold passes a limit, has news, or a dividend cut-off is near. Nothing shows when nothing happens.</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={rules.enabled}
                    aria-label="Holding notifications"
                    onClick={() => update({ enabled: !rules.enabled })}
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 before:absolute before:-inset-2.5 before:content-[''] ${rules.enabled ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-700"}`}
                >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${rules.enabled ? "translate-x-6" : ""}`} />
                </button>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${rules.enabled ? "" : "opacity-50 pointer-events-none"}`} aria-disabled={!rules.enabled}>
                {([
                    ["stopLoss", "Stop-loss", "notify when down this % from your average cost"],
                    ["target", "Target", "notify when up this % from your average cost"],
                    ["dayMove", "Big day move", "notify when it moves this % in one day"],
                ] as const).map(([k, label, hint]) => (
                    <label key={k} className="block">
                        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{label} (%)</span>
                        <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={rules[k]}
                            onChange={e => update({ [k]: num(e.target.value) } as Partial<HoldingAlertRules>)}
                            className="mt-1 w-full min-h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 text-base outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                        />
                        <span className="block text-xs text-zinc-500 mt-1">{hint}</span>
                    </label>
                ))}
            </div>
            <p className="text-xs text-zinc-500">Set a limit to 0 to turn that rule off. Each alert pops up once a day. Works while SoloTrackr is open.</p>
        </div>
    );
}
