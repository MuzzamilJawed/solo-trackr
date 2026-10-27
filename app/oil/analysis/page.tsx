"use client";

import { LineChart } from "lucide-react";
import { useRouter } from "next/navigation";
import OilGraphAnalysis from "../../components/OilGraphAnalysis";

export default function OilAnalysisPage() {
    const router = useRouter();
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark selection:bg-blue-500/30 overflow-x-clip">
            {/* Header */}
            <div className="safe-top sticky top-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 shadow-sm w-full">
                <div className="pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 page-shell mx-auto flex items-center gap-3">
                    <button onClick={() => router.push("/oil")} className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center group shrink-0" title="Back to Oil & Energy">
                        <span className="text-zinc-500 group-hover:text-blue-500 transition-colors font-bold">←</span>
                    </button>
                    <div>
                        <h1 className="text-xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50 flex items-center gap-2 uppercase italic tracking-tighter leading-none">
                            <LineChart className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} /> Graph <span className="text-blue-500">Analysis</span>
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 text-[11px] sm:text-xs font-black uppercase tracking-[0.2em] mt-1">
                            Oil &amp; Energy · Velocity Terminal
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-4 sm:p-8 page-shell mx-auto w-full">
                <OilGraphAnalysis />
            </div>
        </div>
    );
}
