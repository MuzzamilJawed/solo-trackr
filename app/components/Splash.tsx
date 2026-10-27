"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Branded launch splash. The SoloTrackr "S" orbits a circular ring on its own,
 * and the user can grab and drag it anywhere around the ring (it resumes the
 * auto-orbit on release). Fades out on "Enter" or after a short idle timeout.
 * Shows once per full page load (a cold app launch on mobile); SPA navigation
 * keeps the persistent layout mounted, so it does not re-appear between routes.
 */
export default function Splash() {
    const [mounted, setMounted] = useState(false);
    const [native, setNative] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [angle, setAngle] = useState(-Math.PI / 2); // start at the top of the ring

    const boxRef = useRef<HTMLDivElement>(null);
    const angleRef = useRef(angle);
    const draggingRef = useRef(false);
    const rafRef = useRef(0);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { angleRef.current = angle; }, [angle]);

    // Show on first client render (i.e. each real launch / full reload).
    // On native the launch screen has already been showing since the icon was
    // tapped, so a second splash here would just repeat it — we skip this one and
    // dismiss the native one instead, once the app has had a frame to paint.
    useEffect(() => {
        const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        if (cap?.isNativePlatform?.()) {
            setNative(true);
            const t = setTimeout(() => {
                import("@capacitor/splash-screen")
                    .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 300 }))
                    .catch(() => { /* plugin absent — launchShowDuration hides it */ });
            }, 350);
            return () => clearTimeout(t);
        }
        setMounted(true);
    }, []);

    const dismiss = useCallback(() => {
        setLeaving(true);
        setTimeout(() => setMounted(false), 500); // let the fade finish
    }, []);

    // Auto-orbit loop (paused while dragging).
    useEffect(() => {
        if (!mounted) return;
        let last = performance.now();
        const tick = (t: number) => {
            const dt = t - last;
            last = t;
            if (!draggingRef.current) {
                const next = angleRef.current + dt * 0.0021; // ~one lap / 3s
                angleRef.current = next;
                setAngle(next);
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [mounted]);

    // Auto-dismiss if the user never touches it.
    useEffect(() => {
        if (!mounted) return;
        idleTimer.current = setTimeout(dismiss, 2800);
        return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
    }, [mounted, dismiss]);

    const moveDrag = useCallback((e: PointerEvent) => {
        const box = boxRef.current;
        if (!box) return;
        const r = box.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const a = Math.atan2(e.clientY - cy, e.clientX - cx);
        angleRef.current = a;
        setAngle(a);
    }, []);

    const endDrag = useCallback(() => {
        draggingRef.current = false;
        window.removeEventListener("pointermove", moveDrag);
        window.removeEventListener("pointerup", endDrag);
    }, [moveDrag]);

    const startDrag = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        draggingRef.current = true;
        if (idleTimer.current) { clearTimeout(idleTimer.current); idleTimer.current = null; } // let them play
        window.addEventListener("pointermove", moveDrag);
        window.addEventListener("pointerup", endDrag);
    }, [moveDrag, endDrag]);

    useEffect(() => () => {
        window.removeEventListener("pointermove", moveDrag);
        window.removeEventListener("pointerup", endDrag);
    }, [moveDrag, endDrag]);

    if (!mounted || native) return null;

    const R = 96; // orbit radius (px)
    const x = Math.cos(angle) * R;
    const y = Math.sin(angle) * R;

    return (
        <div
            className={`fixed inset-0 z-[200] overflow-hidden flex flex-col items-center justify-center bg-zinc-50 dark:bg-app-dark transition-opacity duration-500 ${leaving ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            {/* ambient glow — breathes */}
            <div className="splash-glow absolute top-1/2 left-1/2 w-[320px] h-[320px] rounded-full bg-blue-600/15 blur-[100px] pointer-events-none" />

            {/* orbit stage — pops in on launch */}
            <div ref={boxRef} className="splash-stage relative" style={{ width: 240, height: 240 }}>
                {/* dashed ring */}
                <svg viewBox="0 0 240 240" className="absolute inset-0 w-full h-full animate-[spin_18s_linear_infinite]">
                    <defs>
                        <linearGradient id="splashRing" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                    </defs>
                    <circle cx="120" cy="120" r="96" fill="none" stroke="url(#splashRing)" strokeWidth="2" strokeDasharray="3 9" strokeLinecap="round" opacity="0.55" />
                </svg>

                {/* wordmark in the center */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="splash-word text-center select-none">
                        <p className="text-2xl font-black italic uppercase tracking-tighter text-zinc-900 dark:text-white leading-none">
                            Solo<span className="text-blue-500">Trackr</span>
                        </p>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 mt-2">All Markets · One Place</p>
                    </div>
                </div>

                {/* draggable orbiting "S" */}
                <button
                    onPointerDown={startDrag}
                    aria-label="Drag SoloTrackr"
                    className="absolute left-1/2 top-1/2 w-12 h-12 -ml-6 -mt-6 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/40 cursor-grab active:cursor-grabbing touch-none will-change-transform"
                    style={{ transform: `translate(${x}px, ${y}px)` }}
                >
                    <span className="text-white font-black text-2xl italic leading-none pointer-events-none">S</span>
                </button>
            </div>

            {/* hint + enter */}
            {/* <div className="mt-10 flex flex-col items-center gap-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">Drag the S around the ring</p>
                <button
                    onClick={dismiss}
                    className="px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-[0.25em] text-zinc-200 hover:bg-white/10 hover:border-blue-500/40 active:scale-95 transition-all"
                >
                    Enter →
                </button>
            </div> */}
        </div>
    );
}
