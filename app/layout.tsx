import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "./components/AppShell";
import CommandPalette from "./components/CommandPalette";
import Splash from "./components/Splash";
import SafeArea from "./components/SafeArea";
import BackButtonHandler from "./components/BackButtonHandler";
import DeepLinkHandler from "./components/DeepLinkHandler";
import { ThemeProvider } from "./components/ThemeProvider";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { SidebarProvider } from "./context/SidebarContext";
import { ToastProvider } from "./context/ToastContext";
import { ConfirmProvider } from "./context/ConfirmContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SoloTrackr — All Markets · One Place",
  description: "Track PSX stocks, gold & silver, forex, crypto and oil — with movers, heatmaps, watchlists and price alerts.",
  applicationName: "SoloTrackr",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "SoloTrackr",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  formatDetection: { telephone: false },
};

// Mobile viewport: fills notches while preserving user zoom controls.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-50 dark:bg-app-dark`}
      >
        <AuthProvider>
          <SettingsProvider>
            <CurrencyProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem
                disableTransitionOnChange
              >
                <SidebarProvider>
                  <ToastProvider>
                    <ConfirmProvider>
                      <SafeArea />
                      <BackButtonHandler />
                      <DeepLinkHandler />
                      <AppShell>{children}</AppShell>
                      <CommandPalette />
                      <Splash />
                    </ConfirmProvider>
                  </ToastProvider>
                </SidebarProvider>
              </ThemeProvider>
            </CurrencyProvider>
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
