"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Lock, Mail, Phone, ShieldCheck, User as UserIcon } from "lucide-react";
import { phoneProblem } from "../lib/phone";
import { useAuth } from "../context/AuthContext";
import GoogleSignInButton from "../components/GoogleSignInButton";
import PasswordField from "../components/PasswordField";
import AuthArtwork from "../components/AuthArtwork";
import DevQuickLogin from "../components/DevQuickLogin";

type Mode = "signin" | "signup";

function LoginScreen() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading, googleClientId, signIn, signUp, signInWithGoogle } = useAuth();

    const [mode, setMode] = useState<Mode>("signin");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [noticeDismissed, setNoticeDismissed] = useState(false);

    // `?reset=1` — the hand-off from /reset-password.
    const notice = searchParams.has("reset") && !noticeDismissed
        ? "Password updated — sign in with your new password."
        : null;

    // Already signed in (or just finished) — the app is behind this page.
    useEffect(() => {
        if (!loading && user) router.replace("/");
    }, [loading, user, router]);

    const run = async (fn: () => Promise<string | null>) => {
        setBusy(true);
        setError(null);
        const err = await fn();
        if (err) {
            setError(err);
            setBusy(false);
        }
        // On success the effect above navigates; keep the button busy until then.
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!email.trim()) { setError("Enter your email"); return; }

        if (mode === "signup") {
            if (!name.trim()) { setError("Enter your name"); return; }
            const phoneErr = phoneProblem(phone);
            if (phoneErr) { setError(phoneErr); return; }
            if (!password) { setError("Enter a password"); return; }
            if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
            if (password !== confirmPassword) { setError("The two passwords don't match"); return; }
            run(() => signUp(name.trim(), email.trim(), phone, password));
            return;
        }

        if (!password) { setError("Enter your password"); return; }
        run(() => signIn(email.trim(), password));
    };

    const switchMode = (next: Mode) => {
        setMode(next);
        setError(null);
        setNoticeDismissed(true);
        setPassword("");
        setConfirmPassword("");
    };

    const inputCls = "w-full pl-10 pr-3 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-blue-500 transition-all";
    // Extra right padding so the text never runs under the show/hide button.
    const passwordCls = inputCls.replace("pr-3", "pr-11");
    const iconCls = "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none";

    return (
        <div className="min-h-screen h-dvh bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white overflow-y-auto">
            {/* Backdrop: masked grid + two slowly drifting glows + a floor fade, so
                the card sits in a scene instead of on a flat slab. */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 auth-bg-grid" />
                <div className="auth-blob-a absolute top-[-22%] left-[-15%] w-[58%] h-[58%] bg-blue-600/15 blur-[130px] rounded-full" />
                <div className="auth-blob-b absolute bottom-[-22%] right-[-15%] w-[58%] h-[58%] bg-indigo-600/15 blur-[130px] rounded-full" />
                <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-zinc-50 dark:from-[#050505] to-transparent" />
            </div>

            {/* One elevated card centred on the page. Splitting the whole viewport
                left both halves floating in dead space and forced the form to a
                width no one wants to type into. */}
            <div className="relative z-10 min-h-full flex items-center justify-center px-4 py-6 lg:py-8 [@media(max-height:760px)]:py-4">
                {/* No min-height: the card sizes to its content, and the spacing below
                    tightens on short viewports so a 720p laptop never has to scroll. */}
                <div className="w-full max-w-[430px] lg:max-w-[min(1100px,92vw)] xl:max-w-[min(1240px,88vw)] lg:grid lg:grid-cols-2 lg:rounded-[2rem] lg:overflow-hidden lg:border lg:border-zinc-200 lg:dark:border-white/10 lg:bg-white lg:dark:bg-zinc-900/70 lg:backdrop-blur-sm lg:shadow-2xl">
                    {/* Showcase panel — desktop only; a phone needs the form, not the art. */}
                    <aside className="hidden lg:flex flex-col justify-between gap-6 2xl:gap-9 p-8 xl:p-10 2xl:p-14 [@media(max-height:800px)]:p-7 [@media(max-height:800px)]:gap-5 bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 text-white relative overflow-hidden">
                        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />

                        <div className="relative">
                            <div className="flex items-center gap-3 mb-6 2xl:mb-9">
                                <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
                                    <span className="text-white font-black text-xl italic leading-none">S</span>
                                </div>
                                <div>
                                    <p className="text-base font-black tracking-tighter italic uppercase leading-none">
                                        Solo<span className="text-blue-200">Trackr</span>
                                    </p>
                                    <p className="text-blue-200/80 text-[10px] font-black uppercase tracking-[0.25em] mt-1">
                                        All Markets · One Place
                                    </p>
                                </div>
                            </div>

                            <h2 className="text-3xl xl:text-[2.5rem] font-black italic uppercase tracking-tighter leading-[0.95]">
                                Every market,<br />one dashboard
                            </h2>
                            <p className="text-blue-100/85 text-[13px] font-semibold leading-relaxed mt-4 max-w-[34ch]">
                                PSX and NASDAQ equities, forex, crypto, gold and energy — tracked live, with your own watchlists, targets and portfolio.
                            </p>
                        </div>

                        <div className="relative py-2">
                            <AuthArtwork />
                        </div>

                        <div className="relative grid grid-cols-2 gap-x-5 gap-y-2.5">
                            {["Live prices", "Price targets", "Portfolio P&L", "Research reports"].map(f => (
                                <span key={f} className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-blue-100/90">
                                    <Check className="w-3.5 h-3.5 shrink-0 text-white" strokeWidth={3} /> {f}
                                </span>
                            ))}
                        </div>
                    </aside>

                    {/* Form panel */}
                    <main className="flex flex-col justify-center p-0 lg:p-8 xl:p-10 2xl:p-14 [@media(max-height:800px)]:lg:p-7">
                        {/* Card grows with the viewport, the form does not — inputs stay
                            at a width that is comfortable to type into. */}
                        <div className="w-full lg:max-w-[420px] lg:mx-auto">
                        {/* Brand — the aside carries this on desktop */}
                        <div className="flex flex-col items-center mb-7 lg:hidden">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/25 mb-4">
                                <span className="text-white font-black text-3xl italic leading-none">S</span>
                            </div>
                            <h1 className="text-2xl font-black tracking-tighter italic uppercase leading-none">
                                Solo<span className="text-blue-500">Trackr</span>
                            </h1>
                            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.25em] mt-2">
                                All Markets · One Place
                            </p>
                        </div>

                        <div className="hidden lg:block mb-6">
                            <h1 className="text-2xl font-black tracking-tighter italic uppercase leading-none">
                                {mode === "signin" ? "Welcome back" : "Create your account"}
                            </h1>
                            <p className="text-zinc-500 text-[11px] font-black uppercase tracking-widest mt-2">
                                {mode === "signin" ? "Sign in to pick up where you left off" : "Free — takes less than a minute"}
                            </p>
                        </div>

                        {/* Its own card on a phone; inside the split card on desktop it
                            drops the chrome so the two don't nest. */}
                        <div className="card backdrop-blur-sm p-6 sm:p-7 lg:bg-transparent lg:dark:bg-transparent lg:border-0 lg:shadow-none lg:p-0 lg:backdrop-blur-none">
                    {/* Sign in / Sign up switch */}
                    <div role="tablist" aria-label="Sign in or create an account" className="flex bg-zinc-100 dark:bg-white/5 p-1 rounded-xl border border-zinc-200 dark:border-white/10 mb-6">
                        {([["signin", "Sign In"], ["signup", "Create Account"]] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={mode === value}
                                onClick={() => switchMode(value)}
                                className={`flex-1 px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${mode === value
                                    ? "bg-white dark:bg-zinc-800 text-blue-600 shadow"
                                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={onSubmit} className="space-y-3">
                        {mode === "signup" && (
                            <div className="relative">
                                <UserIcon className={iconCls} strokeWidth={2.5} />
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    aria-label="Your name"
                                    name="name"
                                    placeholder="Your name"
                                    autoComplete="name"
                                    className={inputCls}
                                />
                            </div>
                        )}

                        <div className="relative">
                            <Mail className={iconCls} strokeWidth={2.5} />
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                aria-label="Email address"
                                name="email"
                                aria-invalid={!!error || undefined}
                                placeholder="you@example.com"
                                autoComplete="email"
                                inputMode="email"
                                className={inputCls}
                            />
                        </div>

                        {mode === "signup" && (
                            <div className="relative">
                                <Phone className={iconCls} strokeWidth={2.5} />
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    aria-label="Phone number"
                                    name="phone"
                                    placeholder="+92 300 1234567"
                                    autoComplete="tel"
                                    inputMode="tel"
                                    className={inputCls}
                                />
                            </div>
                        )}

                        <PasswordField
                            value={password}
                            onChange={setPassword}
                            ariaLabel={mode === "signup" ? "Password, at least 8 characters" : "Password"}
                            placeholder={mode === "signup" ? "At least 8 characters" : "Password"}
                            autoComplete={mode === "signup" ? "new-password" : "current-password"}
                            className={passwordCls}
                            leading={<Lock className={iconCls} strokeWidth={2.5} />}
                        />

                        {mode === "signin" && (
                            <div className="flex justify-end">
                                <Link
                                    href="/forgot-password"
                                    className="text-[11px] font-black uppercase tracking-widest text-zinc-500 hover:text-blue-600 transition-colors"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                        )}

                        {mode === "signup" && (
                            <>
                                <PasswordField
                                    value={confirmPassword}
                                    onChange={setConfirmPassword}
                                    ariaLabel="Confirm password"
                                    placeholder="Verify password"
                                    autoComplete="new-password"
                                    className={passwordCls}
                                    leading={<ShieldCheck className={iconCls} strokeWidth={2.5} />}
                                />
                                {/* Live feedback, so a mismatch isn't only found on submit. */}
                                {confirmPassword.length > 0 && (
                                    <p role="status" className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-1 ${password === confirmPassword ? "text-emerald-500" : "text-amber-500"}`}>
                                        {password === confirmPassword
                                            ? <><Check className="w-3 h-3" strokeWidth={3} /> Passwords match</>
                                            : <>Passwords don&apos;t match yet</>}
                                    </p>
                                )}
                            </>
                        )}

                        {notice && !error && (
                            <p role="status" className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                                {notice}
                            </p>
                        )}

                        {error && (
                            <p role="alert" className="text-[11px] font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-[0.98]"
                        >
                            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={3} />}
                            {mode === "signin" ? "Sign In" : "Create Account"}
                        </button>
                    </form>

                    {googleClientId && (
                        <>
                            <div className="flex items-center gap-3 my-5">
                                <span className="flex-1 h-px bg-zinc-200 dark:bg-white/10" />
                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">or</span>
                                <span className="flex-1 h-px bg-zinc-200 dark:bg-white/10" />
                            </div>
                            <GoogleSignInButton
                                clientId={googleClientId}
                                disabled={busy}
                                onCredential={(credential) => run(() => signInWithGoogle(credential))}
                            />
                        </>
                    )}

                    {/* Renders nothing outside a local dev build */}
                    <DevQuickLogin
                        onPick={(devEmail, devPassword) => {
                            switchMode("signin");
                            setEmail(devEmail);
                            setPassword(devPassword);
                            setError(null);
                        }}
                    />
                        </div>
                    </div>
                </main>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    // useSearchParams (the `?reset=1` banner) needs a Suspense boundary to
    // prerender — same wrapper the stock report screen uses.
    return (
        <Suspense
            fallback={
                <div className="min-h-screen h-dvh flex items-center justify-center bg-zinc-50 dark:bg-app-dark">
                    <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-blue-600" />
                </div>
            }
        >
            <LoginScreen />
        </Suspense>
    );
}
