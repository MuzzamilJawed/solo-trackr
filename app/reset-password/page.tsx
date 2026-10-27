"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import AuthCard from "../components/AuthCard";
import PasswordField from "../components/PasswordField";

// Forgot password, step 3: the link minted after the code was verified. The
// token in the URL is the only thing authorising the change, so the screen
// checks it before showing the form — a dead link should say so up front, not
// after someone has typed a new password twice.

type State =
    | { kind: "checking" }
    | { kind: "invalid"; error: string }
    | { kind: "ready"; name: string; email: string }
    | { kind: "done" };

function ResetPasswordForm() {
    const router = useRouter();
    const token = useSearchParams().get("token") || "";

    const [state, setState] = useState<State>({ kind: "checking" });
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!token) {
                setState({ kind: "invalid", error: "This link is missing its token. Start again from “Forgot password”." });
                return;
            }
            try {
                const res = await fetch(`/api/auth/password-reset/reset?token=${encodeURIComponent(token)}`, { cache: "no-store" });
                const json = await res.json().catch(() => null);
                if (cancelled) return;
                if (!res.ok || !json?.success) {
                    setState({ kind: "invalid", error: json?.error || "This reset link is no longer valid." });
                    return;
                }
                setState({ kind: "ready", name: json.data.name, email: json.data.email });
            } catch {
                if (!cancelled) setState({ kind: "invalid", error: "Network error — couldn't reach the server." });
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    // Land on the sign-in screen once the new password is in place.
    useEffect(() => {
        if (state.kind !== "done") return;
        const t = setTimeout(() => router.replace("/login?reset=1"), 6000);
        return () => clearTimeout(t);
    }, [state.kind, router]);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
        if (password !== confirmPassword) { setError("The two passwords don't match"); return; }

        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/auth/password-reset/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) {
                setError(json?.error || "Could not reset your password — please try again.");
                return;
            }
            setState({ kind: "done" });
        } catch {
            setError("Network error — couldn't reach the server.");
        } finally {
            setBusy(false);
        }
    };

    const inputCls = "w-full pl-10 pr-11 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-blue-500 transition-all";
    const iconCls = "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none";

    if (state.kind === "checking") {
        return (
            <AuthCard title="Checking your link" subtitle="One moment">
                <div className="py-8 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
            </AuthCard>
        );
    }

    if (state.kind === "invalid") {
        return (
            <AuthCard title="Link expired" subtitle="Reset links are single-use and short-lived">
                <p className="flex items-start gap-2 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 mb-4">
                    <TriangleAlert className="w-4 h-4 shrink-0 mt-px" strokeWidth={2.5} /> {state.error}
                </p>
                <Link
                    href="/forgot-password"
                    className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-[0.98]"
                >
                    Request a new code
                </Link>
            </AuthCard>
        );
    }

    if (state.kind === "done") {
        return (
            <AuthCard title="Password updated" subtitle="Taking you to sign in…">
                <div className="py-4 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                        <Check className="w-6 h-6 text-emerald-500" strokeWidth={3} />
                    </div>
                    <p className="text-[11px] font-bold text-zinc-500">
                        Sign in with your new password. The reset link has been used up.
                    </p>
                    <Link
                        href="/login?reset=1"
                        className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-[0.98]"
                    >
                        Go to sign in
                    </Link>
                </div>
            </AuthCard>
        );
    }

    return (
        <AuthCard title="Set a new password" subtitle={`For ${state.email}`}>
            <form onSubmit={onSubmit} className="space-y-3">
                <PasswordField
                    value={password}
                    onChange={setPassword}
                    ariaLabel="New password, at least 8 characters"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    className={inputCls}
                    leading={<Lock className={iconCls} strokeWidth={2.5} />}
                />
                <PasswordField
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    ariaLabel="Confirm new password"
                    placeholder="Verify password"
                    autoComplete="new-password"
                    className={inputCls}
                    leading={<ShieldCheck className={iconCls} strokeWidth={2.5} />}
                />

                {confirmPassword.length > 0 && (
                    <p role="status" className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-1 ${password === confirmPassword ? "text-emerald-500" : "text-amber-500"}`}>
                        {password === confirmPassword
                            ? <><Check className="w-3 h-3" strokeWidth={3} /> Passwords match</>
                            : <>Passwords don&apos;t match yet</>}
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
                    Reset password
                </button>
            </form>
        </AuthCard>
    );
}

export default function ResetPasswordPage() {
    // useSearchParams needs a Suspense boundary to prerender.
    return (
        <Suspense
            fallback={
                <AuthCard title="Checking your link" subtitle="One moment">
                    <div className="py-8 flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                    </div>
                </AuthCard>
            }
        >
            <ResetPasswordForm />
        </Suspense>
    );
}
