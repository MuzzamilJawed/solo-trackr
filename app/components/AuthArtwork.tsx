// Decorative market-analysis vector for the sign-in screen.
//
// Deliberately dependency-free: one inline SVG plus CSS keyframes (in
// globals.css), no chart library and no runtime data. Every value below is a
// literal so the server and client render identical markup — nothing here is
// random or time-based, which would trip a hydration mismatch.

// Static "session" used by the candles. h/l are the wick, o/c the body.
const CANDLES = [
    { x: 24, h: 150, l: 186, o: 178, c: 158, up: true },
    { x: 62, h: 138, l: 172, o: 168, c: 146, up: true },
    { x: 100, h: 132, l: 176, o: 142, c: 168, up: false },
    { x: 138, h: 108, l: 158, o: 154, c: 118, up: true },
    { x: 176, h: 104, l: 148, o: 114, c: 140, up: false },
    { x: 214, h: 74, l: 136, o: 132, c: 84, up: true },
    { x: 252, h: 70, l: 116, o: 80, c: 108, up: false },
    { x: 290, h: 44, l: 108, o: 104, c: 54, up: true },
    { x: 328, h: 40, l: 84, o: 78, c: 48, up: true },
];

const LINE = "M14,176 L52,158 L90,166 L128,126 L166,140 L204,96 L242,112 L280,72 L318,58 L356,34";

export default function AuthArtwork() {
    return (
        <div className="relative w-full max-w-[390px] 2xl:max-w-[460px] [@media(max-height:800px)]:max-w-[340px] mx-auto">
            <svg
                viewBox="0 0 380 210"
                className="w-full h-auto overflow-visible"
                role="img"
                aria-label="Illustration of a rising market chart"
            >
                <defs>
                    {/* Tuned to sit on the brand-gradient panel, so everything is
                        light-on-blue rather than blue-on-dark. */}
                    <linearGradient id="auth-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="auth-stroke" x1="0" y1="1" x2="1" y2="0">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>
                    <linearGradient id="auth-sheen" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                        <stop offset="50%" stopColor="#ffffff" stopOpacity="0.10" />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                    <clipPath id="auth-clip">
                        <rect x="0" y="0" width="380" height="210" rx="18" />
                    </clipPath>
                </defs>

                {/* Grid */}
                <g className="auth-grid" stroke="#ffffff" strokeWidth="1" opacity="0.16">
                    {[26, 62, 98, 134, 170].map(y => (
                        <line key={y} x1="8" y1={y} x2="372" y2={y} strokeDasharray="3 7" />
                    ))}
                </g>

                {/* Candles */}
                <g className="auth-candles">
                    {CANDLES.map((c, i) => {
                        const tone = c.up ? "#6ee7b7" : "#fda4af";
                        const top = Math.min(c.o, c.c);
                        const height = Math.max(3, Math.abs(c.c - c.o));
                        return (
                            <g key={c.x} className="auth-candle" style={{ animationDelay: `${i * 70}ms` }}>
                                <line x1={c.x} y1={c.h} x2={c.x} y2={c.l} stroke={tone} strokeWidth="1.5" opacity="0.6" />
                                <rect x={c.x - 5} y={top} width="10" height={height} rx="2" fill={tone} opacity="0.75" />
                            </g>
                        );
                    })}
                </g>

                {/* Trend line + fill under it */}
                <path className="auth-area" d={`${LINE} L356,196 L14,196 Z`} fill="url(#auth-area)" />
                <path
                    className="auth-line"
                    d={LINE}
                    fill="none"
                    stroke="url(#auth-stroke)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Live marker at the leading edge */}
                <g className="auth-marker">
                    <circle cx="356" cy="34" r="12" fill="#ffffff" opacity="0.28" className="auth-ping" />
                    <circle cx="356" cy="34" r="5.5" fill="#ffffff" stroke="#1d4ed8" strokeWidth="2.5" />
                </g>

                {/* Slow sheen sweep — the only continuously moving part */}
                <g clipPath="url(#auth-clip)">
                    <rect className="auth-sheen" x="-220" y="0" width="220" height="210" fill="url(#auth-sheen)" />
                </g>
            </svg>

            {/* Floating quote chips — solid white so they lift off the gradient */}
            <div className="absolute -top-4 -right-1 auth-float rounded-xl bg-white shadow-xl shadow-blue-950/20 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">KSE 100</p>
                <p className="text-xs font-black font-mono text-emerald-600">▲ 1.24%</p>
            </div>
            <div className="absolute -bottom-5 left-1 auth-float auth-float-slow rounded-xl bg-white shadow-xl shadow-blue-950/20 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Gold · Tola</p>
                <p className="text-xs font-black font-mono text-zinc-900">Rs.418,991</p>
            </div>
        </div>
    );
}
