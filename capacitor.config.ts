import type { CapacitorConfig } from '@capacitor/cli';

// The native Android/iOS shells load your DEPLOYED Next.js server (this app needs
// its API routes + MongoDB, so it can't be bundled fully offline). Set the URL:
//
//   • Production:  set CAP_SERVER_URL to your https domain, e.g.
//       CAP_SERVER_URL=https://solotrackr.example.com npx cap sync
//   • LAN dev:     point at your machine's IP while `npm run dev` is running, e.g.
//       CAP_SERVER_URL=http://192.168.1.20:3005 npx cap sync
//
// The fallback is production on purpose: a bare `npx cap sync` used to bake in a
// LAN IP, which ships an app that can only work on one Wi-Fi network.
const SERVER_URL = process.env.CAP_SERVER_URL || 'https://solo-trackr.vercel.app';
const isHttps = SERVER_URL.startsWith('https://');

const config: CapacitorConfig = {
  appId: 'com.solotrackr.app',
  appName: 'SoloTrackr',
  // Fallback web assets shipped inside the app (used before the remote URL loads
  // and if the server is unreachable). `npm run mobile:web` populates it.
  webDir: 'mobile-shell',
  server: {
    url: SERVER_URL,
    // Allow plain-HTTP only for LAN development against http:// URLs.
    cleartext: !isHttps,
    androidScheme: 'https',
    // If server.url can't load (offline, server down) show mobile-shell/index.html
    // — a retry screen — instead of the WebView's raw error page.
    errorPath: 'index.html',
  },
  backgroundColor: '#050505',
  android: {
    backgroundColor: '#050505',
  },
  ios: {
    backgroundColor: '#050505',
    contentInset: 'always',
  },
  plugins: {
    // One splash, and it is this native one — visible from the tap, unlike the
    // in-app splash which can only appear once the remote page has loaded. It
    // shows the same logo the launch window animates to, then hides as soon as
    // the app has painted. launchShowDuration is the backstop for an unreachable
    // server. <Splash> renders nothing on native so this is never doubled up.
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      androidSplashResourceName: 'splash_brand',
      backgroundColor: '#050505',
      androidScaleType: 'FIT_XY',
      showSpinner: false,
    },
    // Initial value only — <SafeArea> re-applies the style at runtime to match
    // the active light/dark theme, otherwise the clock and signal icons end up
    // white-on-white in light mode. `backgroundColor` is a no-op under the
    // mandatory edge-to-edge of Android 15+; the app paints that strip itself.
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
