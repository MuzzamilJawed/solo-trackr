import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build (e.g. NEXT_DIST_DIR=.next-verify npx next build) run
  // beside a running `next dev` without overwriting its .next cache.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
