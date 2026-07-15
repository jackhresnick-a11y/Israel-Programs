import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// No nonce-based script-src: that requires forcing every page to dynamic
// rendering (Next.js can only inject a nonce into its own hydration scripts
// during SSR), which would drop static optimization/ISR site-wide -- too big
// an architecture change for a hardening pass. 'unsafe-inline' on script/style
// is Next's documented fallback (see content-security-policy.md's "Without
// Nonces" section) and still meaningfully narrows what a slipped-through XSS
// or a compromised third party could do: no attacker-hosted script/frame,
// no clickjacking, no MIME sniffing, no arbitrary form/beacon target.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://img.clerk.com https://*.clerk.accounts.dev;
  font-src 'self';
  connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com;
  frame-src https://*.clerk.accounts.dev https://challenges.cloudflare.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.facebook.com https://www.instagram.com https://www.tiktok.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
