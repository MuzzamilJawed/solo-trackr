"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LayoutDashboard, TrendingUp, Star, Briefcase, Menu } from "lucide-react";
import { useSidebar } from "../context/SidebarContext";
import { useSettings } from "../context/SettingsContext";
import { isModuleEnabled } from "../lib/modules";

const TABS = [
    { name: "Home", href: "/", icon: LayoutDashboard },
    { name: "Stocks", href: "/stocks", icon: TrendingUp, module: "stocks" },
    { name: "Watchlist", href: "/watchlist", icon: Star, module: "watchlist" },
    { name: "Portfolio", href: "/portfolio", icon: Briefcase, module: "portfolio" },
];

// Phone-only primary navigation (the drawer stays for everything else, reached
// via "More"). Hidden from lg up where the sidebar rail is always visible.
export default function BottomNav() {
    const pathname = usePathname() || "/";
    const { mobileOpen, setMobileOpen } = useSidebar();
    const { settings } = useSettings();

    // Tells fixed bottom UI (toasts, compare tray, page padding) how much room
    // the bar takes — see --tabbar-h in globals.css.
    useEffect(() => {
        document.documentElement.classList.add("has-tabbar");
        return () => document.documentElement.classList.remove("has-tabbar");
    }, []);

    const tabs = TABS.filter(t => !t.module || isModuleEnabled(settings.modules, t.module));
    const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

    const base = "flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] font-bold active:scale-95 transition-transform";

    return (
        <nav
            aria-label="Primary"
            className="lg:hidden fixed bottom-0 inset-x-0 z-[85] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 pb-[var(--sa-bottom)]"
        >
            <div className="flex items-stretch">
                {tabs.map(({ name, href, icon: Icon }) => {
                    const active = isActive(href) && !mobileOpen;
                    return (
                        <Link
                            key={href}
                            href={href}
                            aria-current={active ? "page" : undefined}
                            className={`${base} ${active ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400"}`}
                        >
                            <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
                            <span className="truncate max-w-full px-1">{name}</span>
                        </Link>
                    );
                })}
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={mobileOpen}
                    className={`${base} ${mobileOpen ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400"}`}
                >
                    <Menu className="w-5 h-5" strokeWidth={2} aria-hidden />
                    <span>More</span>
                </button>
            </div>
        </nav>
    );
}
