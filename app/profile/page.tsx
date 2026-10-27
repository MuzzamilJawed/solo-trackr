"use client";

import { useCallback, useEffect, useState } from "react";
import {
    UserCircle, ShieldCheck, Mail, Phone, CalendarDays, Clock, KeyRound,
    Star, Briefcase, Globe, Layers, Check,
} from "lucide-react";
import { phoneProblem } from "../lib/phone";
import PageSkeleton from "../components/PageSkeleton";
import PasswordField from "../components/PasswordField";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";

interface ProfileData {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    image: string | null;
    role: "admin" | "user";
    providers: string[];
    createdAt: string;
    lastLoginAt: string | null;
    watching: number;
    hasPassword: boolean;
    stats: {
        watchlists: number;
        trackedSymbols: number;
        trades: number;
        openPositions: number;
        firstTrade: string | null;
        lastTrade: string | null;
    };
}

const fmtDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const initials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

export default function ProfilePage() {
    const { success, error } = useToast();
    const { refresh, googleClientId } = useAuth();

    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [savingName, setSavingName] = useState(false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [savingPassword, setSavingPassword] = useState(false);
    const [linkingGoogle, setLinkingGoogle] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/profile", { cache: "no-store" });
            const json = await res.json();
            if (json?.success) {
                setProfile(json.data);
                setName(json.data.name);
                setPhone(json.data.phone || "");
            }
        } catch {
            error("Couldn't load your profile");
        } finally {
            setLoading(false);
        }
    }, [error]);

    useEffect(() => { load(); }, [load]);

    const detailsDirty = !!profile && (name.trim() !== profile.name || phone.trim() !== (profile.phone || ""));

    const saveDetails = async () => {
        const trimmed = name.trim();
        if (!trimmed) { error("Enter your name"); return; }
        if (phone.trim()) {
            const problem = phoneProblem(phone);
            if (problem) { error(problem); return; }
        }
        if (!detailsDirty) return;
        setSavingName(true);
        try {
            const res = await fetch("/api/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed, phone: phone.trim() }),
            });
            const json = await res.json();
            if (json?.success) {
                setProfile(p => (p ? { ...p, name: json.data.name, phone: json.data.phone } : p));
                setPhone(json.data.phone || "");
                await refresh();          // update the sidebar chip too
                success("Profile updated");
            } else {
                error(json?.error || "Couldn't update your profile");
            }
        } catch {
            error("Network error — couldn't update your profile");
        } finally {
            setSavingName(false);
        }
    };

    // Attaching Google to an existing account — the profile equivalent of the
    // Google button on the sign-in screen.
    const linkGoogle = useCallback(async (credential: string) => {
        setLinkingGoogle(true);
        try {
            const res = await fetch("/api/profile/link-google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential }),
            });
            const json = await res.json();
            if (json?.success) {
                setProfile(p => (p ? { ...p, providers: json.data.providers, image: json.data.image } : p));
                await refresh();
                success("Google account connected — you can now sign in with it");
            } else {
                error(json?.error || "Couldn't connect your Google account");
            }
        } catch {
            error("Network error — couldn't connect your Google account");
        } finally {
            setLinkingGoogle(false);
        }
    }, [refresh, success, error]);

    const unlinkGoogle = async () => {
        setLinkingGoogle(true);
        try {
            const res = await fetch("/api/profile/link-google", { method: "DELETE" });
            const json = await res.json();
            if (json?.success) {
                setProfile(p => (p ? { ...p, providers: json.data.providers } : p));
                await refresh();
                success("Google account disconnected");
            } else {
                error(json?.error || "Couldn't disconnect your Google account");
            }
        } catch {
            error("Network error — couldn't disconnect your Google account");
        } finally {
            setLinkingGoogle(false);
        }
    };

    const savePassword = async () => {
        if (newPassword.length < 8) { error("New password must be at least 8 characters"); return; }
        if (newPassword !== confirmPassword) { error("The two passwords don't match"); return; }
        setSavingPassword(true);
        try {
            const res = await fetch("/api/profile/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const json = await res.json();
            if (json?.success) {
                setProfile(p => (p ? { ...p, hasPassword: true, providers: Array.from(new Set([...p.providers, "credentials"])) } : p));
                setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
                success(profile?.hasPassword ? "Password changed" : "Password set — you can now sign in with email");
            } else {
                error(json?.error || "Couldn't change your password");
            }
        } catch {
            error("Network error — couldn't change your password");
        } finally {
            setSavingPassword(false);
        }
    };

    if (loading) return <PageSkeleton variant="form" />;
    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center px-6 text-center bg-zinc-50 dark:bg-app-dark">
                <p className="text-zinc-500 font-black uppercase tracking-widest text-xs">Couldn&apos;t load your profile</p>
            </div>
        );
    }

    // Every input is the same height (py-2.5) and every label/field pair uses the
    // same `space-y-1`, so the two form columns stay row-aligned.
    const inputCls = "w-full px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-blue-500 transition-all";
    // Extra right padding so the text never runs under the show/hide button.
    const passwordCls = inputCls.replace("px-3", "pl-3 pr-11");
    const labelCls = "text-[10px] font-black text-zinc-400 uppercase tracking-widest";
    const fieldCls = "space-y-1";
    const cardCls = "bg-white dark:bg-zinc-900/50 rounded-2xl sm:rounded-[2rem] border border-zinc-200 dark:border-white/5 shadow-sm p-5 sm:p-6 flex flex-col";
    const cardTitleCls = "text-sm font-black uppercase tracking-tighter italic mb-1 min-h-[1.25rem]";
    const cardSubCls = "text-[11px] text-zinc-400 font-bold mb-4 min-h-[1.5rem]";
    const buttonCls = "w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all";

    const googleLinked = profile.providers.includes("google");

    const stats = [
        { label: "Watchlists", val: profile.stats.watchlists, icon: Star, tone: "text-blue-500" },
        { label: "Symbols Tracked", val: profile.stats.trackedSymbols, icon: Layers, tone: "text-indigo-500" },
        { label: "Trades Recorded", val: profile.stats.trades, icon: Briefcase, tone: "text-emerald-500" },
        { label: "Instruments Traded", val: profile.stats.openPositions, icon: Layers, tone: "text-amber-500" },
        { label: "Assets Watched", val: profile.watching, icon: Globe, tone: "text-orange-500" },
    ];

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white">
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full" />
            </div>

            <header className="safe-top sticky top-0 z-50 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="max-w-[1100px] mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-3 sm:py-6">
                    <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase leading-none flex items-center gap-2">
                        <UserCircle className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500 shrink-0" strokeWidth={2} /> My <span className="text-blue-500">Profile</span>
                    </h1>
                    <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] mt-1">Account · Activity · Security</p>
                </div>
            </header>

            <main className="max-w-[1100px] mx-auto p-4 sm:p-8 relative z-10 space-y-6">
                {/* Identity */}
                <div className="card p-5 sm:p-7">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                        {profile.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.image} alt="" referrerPolicy="no-referrer" className="w-20 h-20 shrink-0 rounded-3xl object-cover border border-zinc-200 dark:border-zinc-700" />
                        ) : (
                            <div className="w-20 h-20 shrink-0 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
                                <span className="text-white font-black text-2xl italic leading-none">{initials(profile.name)}</span>
                            </div>
                        )}

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl sm:text-2xl font-black tracking-tighter italic uppercase truncate">{profile.name}</h2>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${profile.role === "admin" ? "bg-blue-500/10 text-blue-500" : "bg-zinc-500/10 text-zinc-500"}`}>
                                    {profile.role === "admin" && <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />}
                                    {profile.role}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                                <p className="text-xs font-bold text-zinc-500 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} /> {profile.email}</p>
                                {profile.phone && (
                                    <p className="text-xs font-bold text-zinc-500 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} /> {profile.phone}</p>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3">
                                <span className={`${labelCls} flex items-center gap-1.5`}><CalendarDays className="w-3.5 h-3.5" strokeWidth={2.5} /> Joined <span className="text-zinc-600 dark:text-zinc-300">{fmtDate(profile.createdAt)}</span></span>
                                <span className={`${labelCls} flex items-center gap-1.5`}><Clock className="w-3.5 h-3.5" strokeWidth={2.5} /> Last sign-in <span className="text-zinc-600 dark:text-zinc-300">{fmtDateTime(profile.lastLoginAt)}</span></span>
                            </div>
                        </div>

                        <div className="shrink-0 sm:min-w-[220px]">
                            <p className={`${labelCls} mb-1.5`}>Sign-in methods</p>
                            <div className="flex gap-1.5">
                                {["credentials", "google"].map(p => {
                                    const on = profile.providers.includes(p);
                                    return (
                                        <span key={p} className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border ${on ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-zinc-100 dark:bg-white/5 text-zinc-400 border-zinc-200 dark:border-white/10"}`}>
                                            {on && <Check className="w-3 h-3" strokeWidth={3} />}
                                            {p === "credentials" ? "Password" : "Google"}
                                        </span>
                                    );
                                })}
                            </div>

                            {/* Connect / disconnect Google */}
                            <div className="mt-3">
                                {googleLinked ? (
                                    <button
                                        onClick={unlinkGoogle}
                                        disabled={linkingGoogle || !profile.hasPassword}
                                        title={profile.hasPassword ? "Disconnect Google" : "Set a password first"}
                                        className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-red-500 disabled:hover:text-zinc-400 disabled:opacity-50 transition-colors"
                                    >
                                        {linkingGoogle ? "Working…" : "Disconnect Google"}
                                    </button>
                                ) : googleClientId ? (
                                    <GoogleSignInButton
                                        clientId={googleClientId}
                                        disabled={linkingGoogle}
                                        onCredential={linkGoogle}
                                    />
                                ) : (
                                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 leading-relaxed max-w-[220px]">
                                        Google sign-in isn&apos;t configured — set <span className="text-zinc-500">GOOGLE_CLIENT_ID</span> in .env
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Activity */}
                <div>
                    <h2 className="text-sm font-black uppercase tracking-tighter italic mb-3">Your Activity</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                        {stats.map(s => (
                            <div key={s.label} className="card p-4 sm:p-5">
                                <s.icon className={`w-4 h-4 mb-2 ${s.tone}`} strokeWidth={2} />
                                <p className="text-2xl font-black font-mono tabular-nums tracking-tighter">{s.val}</p>
                                <p className="text-[10px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>
                    {profile.stats.trades > 0 && (
                        <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mt-3">
                            Trading between {fmtDate(profile.stats.firstTrade)} and {fmtDate(profile.stats.lastTrade)}
                        </p>
                    )}
                </div>

                {/* Both cards share one field-row rhythm (`fieldCls` + `space-y-3`)
                    and push their button down with `mt-auto`, so the two columns
                    line up row-for-row and end at the same height. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                    {/* Account details */}
                    <div className={cardCls}>
                        <h2 className={cardTitleCls}>Account Details</h2>
                        <p className={cardSubCls}>Your name is shown in the sidebar and on your account.</p>

                        <div className="space-y-3">
                            <div className={fieldCls}>
                                <label htmlFor="pf-name" className={labelCls}>Name</label>
                                <input id="pf-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveDetails()} className={inputCls} />
                            </div>
                            <div className={fieldCls}>
                                <label htmlFor="pf-phone" className={labelCls}>Phone</label>
                                <input
                                    id="pf-phone"
                                    type="tel"
                                    inputMode="tel"
                                    autoComplete="tel"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && saveDetails()}
                                    placeholder="+92 300 1234567"
                                    className={inputCls}
                                />
                            </div>
                            <div className={fieldCls}>
                                <label htmlFor="pf-email" className={labelCls}>Email · not editable</label>
                                <input id="pf-email" value={profile.email} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
                            </div>
                        </div>

                        <div className="mt-auto pt-4">
                            <button
                                onClick={saveDetails}
                                disabled={savingName || !name.trim() || !detailsDirty}
                                className={buttonCls}
                            >
                                {savingName ? "Saving…" : "Save Changes"}
                            </button>
                        </div>
                    </div>

                    {/* Password */}
                    <div className={cardCls}>
                        <h2 className={`${cardTitleCls} flex items-center gap-2`}>
                            <KeyRound className="w-4 h-4 shrink-0" strokeWidth={2} /> {profile.hasPassword ? "Change Password" : "Set a Password"}
                        </h2>
                        <p className={cardSubCls}>
                            {profile.hasPassword
                                ? "You'll stay signed in on this device."
                                : "You signed up with Google — set a password to also sign in with your email."}
                        </p>

                        <div className="space-y-3">
                            {profile.hasPassword && (
                                <div className={fieldCls}>
                                    <label htmlFor="pf-cur-pw" className={labelCls}>Current password</label>
                                    <PasswordField id="pf-cur-pw" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" className={passwordCls} />
                                </div>
                            )}
                            <div className={fieldCls}>
                                <label htmlFor="pf-new-pw" className={labelCls}>New password</label>
                                <PasswordField id="pf-new-pw" value={newPassword} onChange={setNewPassword} autoComplete="new-password" placeholder="At least 8 characters" className={passwordCls} />
                            </div>
                            <div className={fieldCls}>
                                <label htmlFor="pf-conf-pw" className={labelCls}>Confirm new password</label>
                                <PasswordField id="pf-conf-pw" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" className={passwordCls} />
                            </div>
                        </div>

                        <div className="mt-auto pt-4">
                            <button
                                onClick={savePassword}
                                disabled={savingPassword || !newPassword || !confirmPassword}
                                className={buttonCls}
                            >
                                {savingPassword ? "Saving…" : profile.hasPassword ? "Change Password" : "Set Password"}
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
