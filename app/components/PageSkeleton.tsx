// Shared skeleton screens shown as Next.js route `loading.tsx` fallbacks.
// Pure markup (Tailwind `animate-pulse`) — safe as a server component.

type Variant =
    | "dashboard"
    | "explorer"   // filter ribbon + card grid (stocks, nasdaq)
    | "cards"      // header + card grid (crypto, oil, watchlist)
    | "table"      // header + wide table (forex)
    | "metals"
    | "detail"     // symbol pages: chart + side stats
    | "terminal"
    | "report"
    | "portfolio"  // summary cards + analytics + holdings table
    | "form";      // settings, expenses

const Box = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded-xl bg-zinc-200/70 dark:bg-white/[0.06] ${className}`} />
);

const Header = () => (
    <div className="safe-top sticky top-0 z-40 bg-white/70 dark:bg-black/40 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
        <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 flex justify-between items-center gap-4">
            <div className="space-y-2">
                <Box className="h-6 sm:h-8 w-48 sm:w-64" />
                <Box className="h-2.5 w-24" />
            </div>
            <Box className="h-10 w-28 rounded-2xl" />
        </div>
    </div>
);

const StatRow = ({ n = 4, cols = "grid-cols-2 lg:grid-cols-4" }: { n?: number; cols?: string }) => (
    <div className={`grid ${cols} gap-3 sm:gap-6`}>
        {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="card p-5 sm:p-6 space-y-4">
                <div className="flex justify-between items-start">
                    <Box className="w-10 h-10 rounded-xl" />
                    <Box className="h-5 w-14 rounded-full" />
                </div>
                <Box className="h-3 w-20" />
                <Box className="h-7 w-28" />
            </div>
        ))}
    </div>
);

const CardGrid = ({ n = 10, cols = "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" }: { n?: number; cols?: string }) => (
    <div className={`grid grid-cols-1 ${cols} gap-3 sm:gap-6`}>
        {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="card p-3 sm:p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <Box className="h-4 w-16" />
                    <Box className="h-4 w-10" />
                </div>
                <Box className="h-3 w-24" />
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-end">
                    <Box className="h-6 w-20" />
                    <Box className="h-3 w-10" />
                </div>
                <Box className="h-1.5 w-full rounded-full" />
                <div className="grid grid-cols-3 gap-1 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <Box className="h-3" /><Box className="h-3" /><Box className="h-3" />
                </div>
            </div>
        ))}
    </div>
);

const TableBlock = ({ rows = 8, colsHead = 5 }: { rows?: number; colsHead?: number }) => (
    <div className="card overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-white/5 flex justify-between items-center">
            <Box className="h-5 w-40" />
            <Box className="h-8 w-24 rounded-xl" />
        </div>
        <div className="p-4 sm:p-6 space-y-4">
            <div className="flex gap-4">
                {Array.from({ length: colsHead }).map((_, i) => <Box key={i} className="h-3 flex-1" />)}
            </div>
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex gap-4 items-center">
                    {Array.from({ length: colsHead }).map((_, i) => <Box key={i} className={`h-5 flex-1 ${i === 0 ? 'max-w-[120px]' : ''}`} />)}
                </div>
            ))}
        </div>
    </div>
);

const Chart = ({ h = "h-[400px] sm:h-[560px]" }: { h?: string }) => (
    <div className={`card p-4 sm:p-8 ${h}`}>
        <div className="flex justify-between items-center mb-6">
            <Box className="h-5 w-40" />
            <Box className="h-8 w-40 rounded-xl" />
        </div>
        <Box className="h-[calc(100%-4rem)] w-full rounded-2xl" />
    </div>
);

const Filters = () => (
    <div className="card p-4 sm:p-8 space-y-6">
        <div className="flex justify-between items-center">
            <Box className="h-6 w-48" />
            <Box className="h-9 w-40 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Box key={i} className="h-12 rounded-2xl" />)}
        </div>
    </div>
);

function Body({ variant }: { variant: Variant }) {
    switch (variant) {
        case "dashboard":
            return (
                <div className="space-y-8 sm:space-y-12">
                    <StatRow n={5} cols="grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" />
                    <Box className="h-16 rounded-[1.5rem] sm:rounded-[2rem]" />
                    <div className="space-y-4">
                        <Box className="h-8 w-56" />
                        <CardGrid n={4} cols="lg:grid-cols-4" />
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <Box className="h-64 rounded-[2rem]" />
                        <Box className="h-64 rounded-[2rem]" />
                    </div>
                </div>
            );
        case "explorer":
            return (
                <div className="space-y-8">
                    <Box className="h-14 rounded-[1.5rem] sm:rounded-[2rem]" />
                    <Filters />
                    <CardGrid n={10} />
                </div>
            );
        case "cards":
            return (
                <div className="space-y-8">
                    <StatRow n={4} />
                    <CardGrid n={10} />
                </div>
            );
        case "table":
            return (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-3"><TableBlock rows={8} colsHead={5} /></div>
                        <Box className="h-72 rounded-[2rem]" />
                    </div>
                </div>
            );
        case "metals":
            return (
                <div className="space-y-6">
                    <StatRow n={4} />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        <Box className="h-52 rounded-[2rem]" />
                        <Box className="h-52 rounded-[2rem]" />
                    </div>
                    <TableBlock rows={6} colsHead={6} />
                    <Chart />
                </div>
            );
        case "detail":
            return (
                <div className="space-y-8">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6"><StatRow n={4} /></div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2"><Chart /></div>
                        <div className="space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => <Box key={i} className="h-16 rounded-2xl" />)}
                        </div>
                    </div>
                </div>
            );
        case "terminal":
            return (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => <Box key={i} className="h-20 rounded-2xl" />)}
                    </div>
                    <Chart h="h-[520px] sm:h-[640px]" />
                </div>
            );
        case "report":
            return (
                <div className="space-y-6">
                    <StatRow n={4} />
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="card p-6 space-y-4">
                            <Box className="h-5 w-40" />
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {Array.from({ length: 4 }).map((_, j) => <Box key={j} className="h-14 rounded-xl" />)}
                            </div>
                        </div>
                    ))}
                </div>
            );
        case "portfolio":
            return (
                <div className="space-y-6 sm:space-y-8">
                    {/* Summary metric cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="card p-4 sm:p-5 space-y-2.5">
                                <Box className="h-2.5 w-16" />
                                <Box className="h-6 w-24" />
                            </div>
                        ))}
                    </div>
                    {/* Analytics panel */}
                    <div className="card p-4 sm:p-6">
                        <div className="flex justify-between items-center mb-6">
                            <Box className="h-5 w-40" />
                            <Box className="h-8 w-56 rounded-xl" />
                        </div>
                        <Box className="h-[280px] w-full rounded-2xl" />
                    </div>
                    {/* Holdings table */}
                    <TableBlock rows={5} colsHead={6} />
                </div>
            );
        case "form":
            return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="card p-6 space-y-4">
                            <Box className="h-5 w-32" />
                            {Array.from({ length: 4 }).map((_, j) => <Box key={j} className="h-10 rounded-xl" />)}
                        </div>
                    ))}
                </div>
            );
    }
}

export default function PageSkeleton({ variant = "cards" }: { variant?: Variant }) {
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark">
            <Header />
            <div className="page-shell mx-auto p-4 sm:p-8">
                <Body variant={variant} />
            </div>
        </div>
    );
}
