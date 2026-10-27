"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import PullToRefresh from "./PullToRefresh";
import HoldingNotifier from "./HoldingNotifier";
import { useSidebar } from "../context/SidebarContext";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";
import { moduleForPath, isModuleEnabled } from "../lib/modules";

// Routes that render standalone — no sidebar, no auth gate. Password recovery
// belongs here by definition: you can't sign in to reach it.
const PUBLIC_ROUTES = ["/login", "/forgot-password", "/reset-password"];

export default function AppShell({ children }: { children: React.ReactNode }) {
    const { collapsed } = useSidebar();
    const { settings } = useSettings();
    const { user, loading: authLoading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname || "");
    const signedOut = !authLoading && !user;

    // Everything except the login screen is behind an account.
    useEffect(() => {
        if (signedOut && !isPublicRoute) router.replace("/login");
    }, [signedOut, isPublicRoute, router]);

    // Block direct navigation to a hidden module's page — send home.
    const mod = moduleForPath(pathname || "");
    const blocked = mod ? !isModuleEnabled(settings.modules, mod) : false;

    // Same for /admin/* when the signed-in user isn't an administrator. This is
    // only for the UI — the admin APIs enforce the role themselves.
    const adminRoute = (pathname || "").startsWith("/admin");
    const forbidden = adminRoute && !!user && user.role !== "admin";

    useEffect(() => {
        if ((blocked || forbidden) && !isPublicRoute) router.replace("/");
    }, [blocked, forbidden, isPublicRoute, router]);

    // The login screen owns the whole viewport.
    if (isPublicRoute) return <>{children}</>;

    // Hold the chrome back until we know who (if anyone) is signed in — the
    // dashboard must not flash its data before the redirect to /login.
    if (authLoading || !user) {
        return (
            <div className="min-h-screen h-dvh flex items-center justify-center bg-zinc-50 dark:bg-app-dark">
                <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="flex bg-zinc-50 dark:bg-app-dark">
            <Sidebar />
            <BottomNav />
            <PullToRefresh />
            <HoldingNotifier />
            <main
                className={`flex-1 min-w-0 overflow-x-clip transition-[margin] duration-300 ease-in-out pb-[max(env(safe-area-inset-bottom),var(--tabbar-h))] ${collapsed ? "lg:ml-20" : "lg:ml-64"}`}
            >
                {blocked || forbidden ? (
                    <div className="min-h-screen flex items-center justify-center px-6 text-center">
                        <div>
                            <p className="text-zinc-900 dark:text-white font-black uppercase text-sm tracking-widest mb-2">
                                {forbidden ? "Administrators only" : "Module hidden"}
                            </p>
                            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Redirecting to dashboard…</p>
                        </div>
                    </div>
                ) : children}
            </main>
        </div>
    );
}
