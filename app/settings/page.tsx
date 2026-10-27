"use client";

import HoldingAlertThresholds from "../components/HoldingAlertThresholds";
import { Check, Settings } from "lucide-react";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import { MODULES, DEFAULT_MODULES, isModuleEnabled } from "../lib/modules";
import { CURRENCIES, DEFAULT_CURRENCIES, DEFAULT_CURRENCY, normalizeCurrencies } from "../lib/currency";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  const { success, info } = useToast();
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleChange = (key: string, value: string | boolean) => {
    if (key === 'theme') {
      setTheme(value as string);
    } else if (key === 'refreshInterval') {
      updateSettings({ [key]: parseInt(value as string) });
    } else {
      updateSettings({ [key]: value });
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    success("Settings saved");
  };

  const handleReset = () => {
    updateSettings({
      currency: DEFAULT_CURRENCY,
      currencies: [...DEFAULT_CURRENCIES],
      refreshInterval: 30,
      notifications: true,
      soundAlerts: false,
      priceAlerts: true,
      modules: { ...DEFAULT_MODULES },
    });
    setTheme('system');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    info("Settings restored to defaults");
  };

  // Enabled display currencies. Turning one off can't leave the list empty, and
  // the default currency always follows the list.
  const enabledCurrencies = normalizeCurrencies(settings.currencies, settings.currency);
  const toggleCurrency = (code: string) => {
    const on = enabledCurrencies.includes(code);
    if (on && enabledCurrencies.length === 1) {
      info("Keep at least one display currency");
      return;
    }
    const next = normalizeCurrencies(
      on ? enabledCurrencies.filter(c => c !== code) : [...enabledCurrencies, code],
      "",
    );
    // The default must stay part of the selection.
    updateSettings({ currencies: next, currency: next.includes(settings.currency) ? settings.currency : next[0] });
  };

  const toggleModule = (key: string) => {
    const current = settings.modules || {};
    updateSettings({ modules: { ...current, [key]: !isModuleEnabled(current, key) } });
  };
  const enabledCount = MODULES.filter(m => isModuleEnabled(settings.modules, m.key)).length;

  const selectClass = "w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-200 dark:border-zinc-700 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white selection:bg-blue-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
        <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6">
          <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase text-zinc-900 dark:text-white leading-none flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Settings className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} /> Configuration <span className="text-blue-500 text-xl sm:text-2xl">Hub</span>
          </h1>
          <p className="text-zinc-500 text-[11px] sm:text-xs font-black uppercase tracking-[0.2em] mt-1">
            Dashboard Preferences & Controls
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="page-shell mx-auto p-4 sm:p-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">

          {/* Display Settings */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card backdrop-blur-sm overflow-hidden">
              <div className="px-6 sm:px-8 py-5 border-b border-zinc-100 dark:border-white/5">
                <h2 className="text-base sm:text-lg font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white">Display Settings</h2>
                <p className="text-zinc-500 text-xs font-bold mt-0.5">Visual preferences for the dashboard</p>
              </div>
              <div className="p-5 sm:p-8 space-y-6">
                <div>
                  <p id="set-currencies" className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">Display Currencies</p>
                  <p className="text-xs text-zinc-500 mt-0.5 mb-4">
                    Pick every currency you want available. Select more than one and screens get a currency toggle; with just one, that currency always displays.
                  </p>
                  <div role="group" aria-labelledby="set-currencies" className="flex flex-wrap gap-2">
                    {CURRENCIES.map(({ code, name, symbol }) => {
                      const on = enabledCurrencies.includes(code);
                      return (
                        <button
                          key={code}
                          onClick={() => toggleCurrency(code)}
                          aria-pressed={on}
                          title={name}
                          className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${on
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                        >
                          {code} <span className="opacity-60 font-bold normal-case">{symbol.trim()}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-zinc-400 font-bold mt-3 leading-relaxed">
                    PSX stocks always display in PKR and NASDAQ stocks always in USD — those markets are never converted.
                    Forex, oil, metals, crypto, portfolio, watchlist and the dashboard follow your selection.
                  </p>
                </div>

                <div className="border-t border-zinc-100 dark:border-white/5 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label htmlFor="set-default-currency" className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">Default Currency</label>
                    <p className="text-xs text-zinc-500 mt-0.5">Screens open in this currency</p>
                  </div>
                  <select id="set-default-currency" value={settings.currency} onChange={(e) => handleChange("currency", e.target.value)} className={selectClass}>
                    {enabledCurrencies.map(code => (
                      <option key={code} value={code}>
                        {code} — {CURRENCIES.find(c => c.code === code)?.name ?? code}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="border-t border-zinc-100 dark:border-white/5 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label htmlFor="set-theme" className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">Color Theme</label>
                    <p className="text-xs text-zinc-500 mt-0.5">Light, dark or follow system</p>
                  </div>
                  <select id="set-theme" value={mounted ? (theme ?? 'system') : 'system'} onChange={(e) => handleChange("theme", e.target.value)} className={selectClass}>
                    <option value="light">Light Mode</option>
                    <option value="dark">Dark Mode</option>
                    <option value="system">System Default</option>
                  </select>
                </div>

                <div className="border-t border-zinc-100 dark:border-white/5 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label htmlFor="set-refresh" className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">Auto-Refresh Interval</label>
                    <p className="text-xs text-zinc-500 mt-0.5">How often live data updates</p>
                  </div>
                  <select id="set-refresh" value={settings.refreshInterval} onChange={(e) => handleChange("refreshInterval", e.target.value)} className={selectClass}>
                    <option value="1">Every 1 second</option>
                    <option value="5">Every 5 seconds</option>
                    <option value="10">Every 10 seconds</option>
                    <option value="30">Every 30 seconds</option>
                    <option value="60">Every 1 minute</option>
                    <option value="120">Every 2 minutes</option>
                    <option value="300">Every 5 minutes</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div className="card backdrop-blur-sm overflow-hidden">
              <div className="px-6 sm:px-8 py-5 border-b border-zinc-100 dark:border-white/5">
                <h2 className="text-base sm:text-lg font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white">Alert Settings</h2>
                <p className="text-zinc-500 text-xs font-bold mt-0.5">Notifications and market alerts</p>
              </div>
              <div className="p-5 sm:p-8 space-y-5">
                {[
                  { key: 'notifications', label: 'Enable Notifications', desc: 'In-app alerts while SoloTrackr is open' },
                  { key: 'soundAlerts', label: 'Sound Alerts', desc: 'Audio cues on price events' },
                  { key: 'priceAlerts', label: 'Price Alerts', desc: 'Notify on threshold breaches' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">{label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!(settings as any)[key]}
                      aria-label={label}
                      onClick={() => handleChange(key, !(settings as any)[key])}
                      className={`relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 before:absolute before:-inset-2.5 before:content-[''] ${(settings as any)[key] ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${(settings as any)[key] ? 'translate-x-6' : ''}`}></span>
                    </button>
                  </div>
                ))}
                <HoldingAlertThresholds />
              </div>
            </div>

            {/* Modules */}
            <div className="card backdrop-blur-sm overflow-hidden">
              <div className="px-6 sm:px-8 py-5 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white">Modules</h2>
                  <p className="text-zinc-500 text-xs font-bold mt-0.5">Show or hide sections across the sidebar &amp; dashboard</p>
                </div>
                <span className="text-[11px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-600/10 px-2.5 py-1 rounded-full shrink-0">{enabledCount}/{MODULES.length} on</span>
              </div>
              <div className="p-5 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                {MODULES.map(({ key, label, desc }) => {
                  const on = isModuleEnabled(settings.modules, key);
                  return (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight truncate">{label}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">{desc}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        onClick={() => toggleModule(key)}
                        aria-label={label}
                        className={`relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 before:absolute before:-inset-2.5 before:content-[''] ${on ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${on ? 'translate-x-6' : ''}`}></span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className={`flex-1 py-3 px-6 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-lg ${saved ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 hover:scale-[1.02] active:scale-95'}`}
              >
                {saved ? <><Check className="inline-block w-4 h-4 mr-1" strokeWidth={3} /> Saved</> : 'Save Settings'}
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-3 px-6 rounded-2xl font-black uppercase text-xs tracking-widest bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-all"
              >
                Reset to Default
              </button>
            </div>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-6">
            <div className="card backdrop-blur-sm p-6 sm:p-8">
              <h3 className="text-sm font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white mb-4">Data & Privacy</h3>
              <ul className="space-y-3">
                {[
                  'Data stored locally in your browser',
                  'No personal info sent to servers',
                  'Market data from public APIs',
                  'Settings auto-saved on change',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0"></span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2rem] p-6 sm:p-8 text-white">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-200 mb-2">Pro Tip</p>
              <p className="text-sm font-bold leading-relaxed text-blue-50">
                Set refresh interval to 30s or higher to reduce API calls and improve performance during long sessions.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
