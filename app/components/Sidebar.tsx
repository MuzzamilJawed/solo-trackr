"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useSidebar } from "../context/SidebarContext";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";
import { isModuleEnabled } from "../lib/modules";
import UserMenu from "./UserMenu";
import { useBackHandler } from "../lib/backStack";
import {
  LayoutDashboard, TrendingUp, Globe, ArrowRightLeft, Bitcoin, Gem, Fuel,
  Briefcase, Star, Wallet, Settings, ChevronsLeft, ChevronsRight, X,
  Sun, Moon, Monitor, CandlestickChart, LineChart, ChevronDown, ListFilter,
  UserCircle, Users, ClipboardList, Search, Newspaper, Activity, CalendarClock,
} from "lucide-react";

const navigationGroups = [
  {
    title: "Overview",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
    ]
  },
  {
    title: "Markets",
    items: [
      {
        name: "PSX Stocks", href: "/stocks", icon: TrendingUp, module: "stocks",
        children: [
          { name: "Opportunity Desk", href: "/stocks/opportunities", icon: ListFilter },
          { name: "Trade Analytics", href: "/stocks/terminal", icon: CandlestickChart },
          { name: "Technical Analysis", href: "/stocks/analysis", icon: Activity },
          { name: "Market News", href: "/stocks/news", icon: Newspaper },
        ],
      },
      { name: "NASDAQ Stocks", href: "/nasdaq", icon: Globe, module: "nasdaq" },
      { name: "Forex", href: "/forex", icon: ArrowRightLeft, module: "forex" },
      { name: "Crypto", href: "/crypto", icon: Bitcoin, module: "crypto" },
    ]
  },
  {
    title: "Commodities",
    items: [
      {
        name: "Gold & Silver", href: "/metals", icon: Gem, module: "metals",
        children: [
          { name: "Graph Analysis", href: "/metals/analysis", icon: LineChart },
        ],
      },
      {
        name: "Oil & Energy", href: "/oil", icon: Fuel, module: "oil",
        children: [
          { name: "Graph Analysis", href: "/oil/analysis", icon: LineChart },
        ],
      },
    ]
  },
  {
    title: "Management",
    items: [
      {
        name: "Portfolio", href: "/portfolio", icon: Briefcase, module: "portfolio",
        children: [
          { name: "Reports", href: "/portfolio/reports", icon: ClipboardList },
          { name: "Dividends & Book Closures", href: "/portfolio/dividends", icon: CalendarClock },
        ],
      },
      { name: "Watchlist", href: "/watchlist", icon: Star, module: "watchlist" },
      { name: "Expenses", href: "/expenses", icon: Wallet, module: "expenses" },
    ]
  },
  {
    title: "Account",
    items: [
      { name: "My Profile", href: "/profile", icon: UserCircle },
      { name: "Settings", href: "/settings", icon: Settings },
    ]
  },
  // Rendered only for admins — see `visibleGroups` below.
  {
    title: "Administration",
    adminOnly: true,
    items: [
      { name: "User Management", href: "/admin/users", icon: Users },
    ]
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const { theme, setTheme } = useTheme();
  const { collapsed, toggleCollapsed, mobileOpen: isOpen, setMobileOpen: setIsOpen } = useSidebar();
  const { settings } = useSettings();
  const { user } = useAuth();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  // Android Back closes the mobile drawer instead of leaving the screen.
  useBackHandler(isOpen, () => setIsOpen(false));

  const toggleMenu = (href: string) =>
    setOpenMenus((prev) => ({ ...prev, [href]: !prev[href] }));

  // Hide admin-only groups from regular users, hide nav items for disabled
  // modules, then drop groups that become empty.
  const visibleGroups = navigationGroups
    .filter((g: any) => !g.adminOnly || user?.role === "admin")
    .map(g => ({ ...g, items: g.items.filter((it: any) => !it.module || isModuleEnabled(settings.modules, it.module)) }))
    .filter(g => g.items.length > 0);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date().toLocaleTimeString());

    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Handle closing on navigation for mobile
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Auto-expand the submenu that contains the active route.
  useEffect(() => {
    navigationGroups.forEach((group) => {
      group.items.forEach((item: any) => {
        const children = item.children as { href: string }[] | undefined;
        if (children?.some((c) => c.href === pathname)) {
          setOpenMenus((prev) => ({ ...prev, [item.href]: true }));
        }
      });
    });
  }, [pathname]);

  return (
    <>
      {/* Mobile Toggle Button (top-left hamburger). Hidden once the drawer is
          open — the drawer has its own close button, and showing both put two
          duplicate close icons on screen at once. */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open menu"
        aria-expanded={isOpen}
        className={`lg:hidden fixed top-[calc(0.625rem_+_var(--sa-top))] left-3 z-[100] w-11 h-11 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg items-center justify-center active:scale-90 transition-transform ${isOpen ? "hidden" : "flex"}`}
      >
        <span className="flex flex-col items-center justify-center gap-[3px]">
          <span className="block w-[18px] h-[2px] bg-current rounded-full"></span>
          <span className="block w-[18px] h-[2px] bg-current rounded-full"></span>
          <span className="block w-[18px] h-[2px] bg-current rounded-full"></span>
        </span>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
        />
      )}

      {/* The nav scrolls on its own so the account + theme footer stays pinned
          to the bottom instead of being pushed off short screens. */}
      <aside
        role={isOpen ? "dialog" : undefined}
        aria-modal={isOpen ? true : undefined}
        aria-label="Navigation menu"
        className={`fixed left-0 top-0 h-screen h-dvh w-[min(18rem,88vw)] ${collapsed ? "lg:w-20" : "lg:w-64"} bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-lg overflow-hidden flex flex-col border-r border-zinc-200 dark:border-zinc-800 transition-[transform,width] duration-300 z-[95]
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>

        <div className={`pl-5 sm:pl-6 pr-2 py-6 pt-[calc(1.5rem_+_var(--sa-top))] ${collapsed ? "lg:pl-2 lg:pr-1 lg:py-3" : ""} border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-2`}>
          <Link className="flex items-center gap-3 min-w-0" href="/">
            <div className={`w-9 h-9 ${collapsed ? "lg:w-8 lg:h-8" : ""} shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/25`}>
              <span className="text-white font-black text-xl italic leading-none">S</span>
            </div>
            <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
              <h1 className="text-base font-black tracking-tighter italic uppercase leading-none whitespace-nowrap">Solo<span className="text-blue-500">Trackr</span></h1>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 uppercase font-bold tracking-widest whitespace-nowrap">All Markets · One Place</p>
            </div>
          </Link>
          <button onClick={() => setIsOpen(false)} aria-label="Close menu" className="lg:hidden shrink-0 w-10 h-10 -mr-1 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-90 transition-all"><X className="w-5 h-5" strokeWidth={2.5} /></button>
          {/* Desktop collapse / expand toggle — same row as logo, on the right */}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`hidden lg:flex shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all ${collapsed ? "w-6 h-8" : "w-8 h-8"}`}
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" strokeWidth={2.5} /> : <ChevronsLeft className="w-4 h-4" strokeWidth={2.5} />}
          </button>
        </div>

        {/* Search: its own full-width row (it used to be an icon squeezed into the header,
            colliding with the tagline). Opens the same palette as Ctrl/Cmd+K. */}
        <div className={`px-4 pt-3 ${collapsed ? "lg:px-2" : ""}`}>
          <button
            type="button"
            onClick={() => { setIsOpen(false); window.dispatchEvent(new Event("open-search")); }}
            aria-label="Search stocks"
            title="Search stocks (Ctrl+K)"
            className={`w-full min-h-11 flex items-center gap-3 px-3.5 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 active:scale-[0.98] transition-all ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
          >
            <Search className="w-4 h-4 shrink-0" strokeWidth={2.5} aria-hidden />
            <span className={`flex-1 text-left truncate ${collapsed ? "lg:hidden" : ""}`}>Search stocks…</span>
            <kbd className={`hidden lg:inline text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/10 ${collapsed ? "lg:hidden" : ""}`}>Ctrl K</kbd>
          </button>
        </div>

        <nav className="p-4 space-y-6 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {visibleGroups.map((group) => (
            <div key={group.title} className="space-y-2">
              <h2 className={`text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 px-4 mb-2 ${collapsed ? "lg:hidden" : ""}`}>
                {group.title}
              </h2>
              <div className="space-y-1">
                {group.items.map((item: any) => {
                  const isActive = pathname === item.href;
                  const children = item.children as { name: string; href: string; icon?: any }[] | undefined;
                  const hasChildren = !!(children && children.length > 0);
                  const menuOpen = !!openMenus[item.href];
                  return (
                    <div key={item.href}>
                      <div className="flex items-center gap-1">
                        <Link
                          href={item.href}
                          title={item.name}
                          className={`flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${collapsed ? "lg:justify-center lg:px-0" : ""} ${isActive
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50"
                            }`}
                        >
                          <item.icon className="w-5 h-5 shrink-0" strokeWidth={2} />
                          <span className={`font-bold text-sm tracking-tight ${collapsed ? "lg:hidden" : ""}`}>{item.name}</span>
                        </Link>

                        {/* Submenu open/close toggle */}
                        {hasChildren && (
                          <button
                            type="button"
                            onClick={() => toggleMenu(item.href)}
                            aria-label={menuOpen ? `Collapse ${item.name} submenu` : `Expand ${item.name} submenu`}
                            aria-expanded={menuOpen}
                            title={menuOpen ? "Collapse" : "Expand"}
                            className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all ${collapsed ? "lg:hidden" : ""}`}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${menuOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>

                      {/* Nested submenu (e.g. PSX → Trade Analytics) */}
                      {hasChildren && menuOpen && (
                        <div className={`mt-1 ml-[26px] pl-3 border-l border-zinc-200 dark:border-zinc-800 space-y-1 ${collapsed ? "lg:hidden" : ""}`}>
                          {children!.map((child) => {
                            const childActive = pathname === child.href;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                title={child.name}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold tracking-tight transition-all duration-300 ${childActive
                                  ? "bg-blue-600 text-white shadow shadow-blue-600/20"
                                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50"
                                  }`}
                              >
                                {child.icon && <child.icon className="w-4 h-4 shrink-0" strokeWidth={2} />}
                                <span>{child.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
          <UserMenu collapsed={collapsed} />

          <div className="mb-4">
            <p className={`text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-2 ${collapsed ? "lg:hidden" : ""}`}>Theme</p>
            <div className={`flex bg-zinc-200 dark:bg-zinc-800 rounded-lg p-1 ${collapsed ? "lg:flex-col lg:gap-1" : ""}`}>
              <button
                data-testid="theme-toggle-light"
                onClick={() => setTheme('light')}
                className={`flex-1 flex items-center justify-center p-1.5 min-h-[36px] lg:min-h-0 rounded transition-all ${theme === 'light' ? 'bg-white dark:bg-zinc-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
                title="Light Mode"
              >
                <Sun className="w-4 h-4" strokeWidth={2} />
              </button>
              <button
                data-testid="theme-toggle-dark"
                onClick={() => setTheme('dark')}
                className={`flex-1 flex items-center justify-center p-1.5 min-h-[36px] lg:min-h-0 rounded transition-all ${theme === 'dark' ? 'bg-white dark:bg-zinc-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
                title="Dark Mode"
              >
                <Moon className="w-4 h-4" strokeWidth={2} />
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`flex-1 flex items-center justify-center p-1.5 min-h-[36px] lg:min-h-0 rounded transition-all ${theme === 'system' ? 'bg-white dark:bg-zinc-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
                title="System Auto"
              >
                <Monitor className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          <p className={`text-xs text-zinc-500 ${collapsed ? "lg:hidden" : ""}`}>
            Last updated: {mounted ? currentTime : "--:--"}
          </p>
        </div>
      </aside>
    </>
  );
}
