"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MailCheck } from "lucide-react";
import AuthCard from "../components/AuthCard";
import OtpInput from "../components/OtpInput";

// Forgot password, step 1 and 2: give the email address on the account, then
// prove you hold that inbox with the code we send to it. Verifying mints the
// reset link and this screen hands off to it.

type Step = "identify" | "code";

interface Pending {
    requestId: string;
    sentTo: string;
    expiresInMinutes: number;
    /** Dev servers with no mail provider return the code so the flow works. */
    devCode?: string;
}

const RESEND_SECONDS = 45;

export default function ForgotPasswordPage() {
    const router = useRouter();

    const [step, setStep] = useState<Step>("identify");
    const [identifier, setIdentifier] = useState("");
    const [pending, setPending] = useState<Pending | null>(null);
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    // Guards the auto-submit when the sixth digit lands — without it a failed
    // code would resubmit on every re-render of the filled input.
    const submitted = useRef("");

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const post = async (url: string, body: unknown) => {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        return { ok: res.ok && json?.success === true, json };
    };

    const sendCode = async (resend = false) => {
        if (busy) return;
        if (!identifier.trim()) { setError("Enter your email address"); return; }
        setBusy(true);
        setError(null);
        try {
            const { ok, json } = await post("/api/auth/password-reset/request", { identifier: identifier.trim() });
            if (!ok) { setError(json?.error || "Could not send the code — please try again."); return; }
            setPending(json.data);
            setStep("code");
            setCooldown(RESEND_SECONDS);
            if (resend) { setCode(""); submitted.current = ""; }
        } catch {
            setError("Network error — couldn't reach the server.");
        } finally {
            setBusy(false);
        }
    };

    const verify = useCallback(async (value: string) => {
        if (!pending || busy) return;
        if (value.length !== 6) { setError("Enter the 6-digit code"); return; }
        setBusy(true);
        setError(null);
        try {
            const { ok, json } = await post("/api/auth/password-reset/verify", {
                requestId: pending.requestId,
                code: value,
            });
            if (!ok) {
                setError(json?.error || "That code didn't work.");
                submitted.current = "";      // let the same digits be retried
                return;
            }
            // The link is the credential from here on — follow it.
            router.push(json.data.resetPath as string);
        } catch {
            setError("Network error — couldn't reach the server.");
            submitted.current = "";
        } finally {
            setBusy(false);
        }
    }, [pending, busy, router]);

    const onCodeComplete = (value: string) => {
        if (submitted.current === value) return;
        submitted.current = value;
        verify(value);
    };

    const inputCls = "w-full pl-10 pr-3 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-blue-500 transition-all";
    const iconCls = "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none";
    const buttonCls = "w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-[0.98]";

    if (step === "identify") {
        return (
            <AuthCard
                title="Forgot your password?"
                subtitle="Enter the email address on your account — we'll send a 6-digit code"
            >
                <form
                    onSubmit={e => { e.preventDefault(); sendCode(); }}
                    className="space-y-3"
                >
                    <div className="relative">
                        <Mail className={iconCls} strokeWidth={2.5} />
                        <input
                            type="email"
                            value={identifier}
                            onChange={e => setIdentifier(e.target.value)}
                            aria-label="Email address"
                            name="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            inputMode="email"
                            autoFocus
                            className={inputCls}
                        />
                    </div>

                    {error && (
                        <p role="alert" className="text-[11px] font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                            {error}
                        </p>
                    )}

                    <button type="submit" disabled={busy} className={buttonCls}>
                        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={3} />}
                        Send code
                    </button>
                </form>
            </AuthCard>
        );
    }

    return (
        <AuthCard
            title="Enter your code"
            subtitle={`We sent a ${pending?.expiresInMinutes ?? 10}-minute code to ${pending?.sentTo ?? "you"}`}
        >
            <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <MailCheck className="w-4 h-4 text-blue-500 shrink-0" strokeWidth={2.5} />
                <p className="text-[11px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                    Sent by email · check your spam folder
                </p>
            </div>

            <form
                onSubmit={e => { e.preventDefault(); verify(code); }}
                className="space-y-4"
            >
                <OtpInput value={code} onChange={setCode} disabled={busy} onComplete={onCodeComplete} />

                {pending?.devCode && (
                    <p className="text-[11px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                        Dev server · no mail provider configured · code {pending.devCode}
                    </p>
                )}

                {error && (
                    <p role="alert" className="text-[11px] font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                        {error}
                    </p>
                )}

                <button type="submit" disabled={busy || code.length !== 6} className={buttonCls}>
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={3} />}
                    Verify code
                </button>
            </form>

            <div className="flex items-center justify-between gap-3 mt-5">
                <button
                    type="button"
                    onClick={() => { setStep("identify"); setCode(""); setError(null); submitted.current = ""; }}
                    className="text-[11px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                    Use another email
                </button>
                <button
                    type="button"
                    disabled={busy || cooldown > 0}
                    onClick={() => sendCode(true)}
                    className="text-[11px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 disabled:text-zinc-400 disabled:hover:text-zinc-400 transition-colors"
                >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
            </div>
        </AuthCard>
    );
}
