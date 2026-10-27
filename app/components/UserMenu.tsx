"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const initials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

// Signed-in identity + sign-out, pinned to the sidebar footer. Collapses to
// just the avatar when the sidebar is collapsed.
export default function UserMenu({ collapsed }: { collapsed: boolean }) {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    if (!user) return null;

    const handleSignOut = async () => {
        setBusy(true);
        await signOut();
        router.replace("/login");
    };

    return (
        <div className={`flex items-center gap-2.5 mb-4 ${collapsed ? "lg:flex-col lg:gap-2" : ""}`}>
            {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={user.image}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 shrink-0 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700"
                />
            ) : (
                <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow shadow-blue-600/25">
                    <span className="text-white font-black text-xs leading-none">{initials(user.name)}</span>
                </div>
            )}

            <div className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
                <p className="text-xs font-black tracking-tight truncate text-zinc-900 dark:text-white flex items-center gap-1">
                    {user.name}
                    {user.role === "admin" && (
                        <ShieldCheck className="w-3 h-3 text-blue-500 shrink-0" strokeWidth={2.5} aria-label="Administrator" />
                    )}
                </p>
                <p className="text-[11px] text-zinc-500 font-bold truncate">{user.email}</p>
            </div>

            <button
                onClick={handleSignOut}
                disabled={busy}
                title="Sign out"
                aria-label="Sign out"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-all"
            >
                <LogOut className="w-4 h-4" strokeWidth={2} />
            </button>
        </div>
    );
}
