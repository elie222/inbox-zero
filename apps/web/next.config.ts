import { withSentryConfig } from "@sentry/nextjs";
import { withAxiom } from "next-axiom";
import nextMdx from "@next/mdx";
import withSerwistInit from "@serwist/next";
import { env } from "./env";
import type { NextConfig } from "next";

const withMDX = nextMdx();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@sentry/nextjs", "@sentry/node"],
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ph-avatars.imgix.net",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
      {
        protocol: "https",
        hostname: "images.getinboxzero.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/automation",
        has: [
          {
            type: "cookie",
            key: "__Secure-better-auth.session_token",
          },
        ],
        permanent: false,
      },
      {
        source: "/",
        destination: "/setup",
        has: [
          {
            type: "cookie",
            key: "__Secure-better-auth.session-token.1",
          },
        ],
        permanent: false,
      },
      {
        source: "/feature-requests",
        destination: "https://go.getinboxzero.com/feature-requests",
        permanent: true,
      },
      {
        source: "/feedback",
        destination: "https://go.getinboxzero.com/feedback",
        permanent: true,
      },
      {
        source: "/changelog",
        destination: "https://go.getinboxzero.com/changelog",
        permanent: true,
      },
      {
        source: "/twitter",
        destination: "https://go.getinboxzero.com/x",
        permanent: true,
      },
      {
        source: "/github",
        destination: "https://go.getinboxzero.com/github",
        permanent: true,
      },
      {
        source: "/discord",
        destination: "https://go.getinboxzero.com/discord",
        permanent: true,
      },
      {
        source: "/linkedin",
        destination: "https://go.getinboxzero.com/linkedin",
        permanent: true,
      },
      {
        source: "/waitlist",
        destination: "https://go.getinboxzero.com/waitlist",
        permanent: true,
      },
      {
        source: "/waitlist-other",
        destination: "https://go.getinboxzero.com/waitlist-other",
        permanent: false,
      },
      {
        source: "/affiliates",
        destination: "https://go.getinboxzero.com/affiliate",
        permanent: true,
      },
      {
        source: "/newsletters",
        destination: "/bulk-unsubscribe",
        permanent: false,
      },
      {
        source: "/request-access",
        destination: "/early-access",
        permanent: true,
      },
      {
        source: "/reply-tracker",
        destination: "/reply-zero",
        permanent: false,
      },
      {
        source: "/game",
        destination: "https://go.getinboxzero.com/game",
        permanent: false,
      },
      {
        source: "/soc2",
        destination: "https://go.getinboxzero.com/soc2",
        permanent: true,
      },
      {
        source: "/sales",
        destination: "https://go.getinboxzero.com/sales",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/:path*",
        destination: "https://app.posthog.com/:path*",
      },
      {
        source: "/vendor/lemon/affiliate.js",
        destination: "https://lmsqueezy.com/affiliate.js",
      },
      {
        source: "/_proxy/dub/track/:path",
        destination: "https://api.dub.co/track/:path",
      },
      {
        source: "/_proxy/dub/script.js",
        destination: "https://www.dubcdn.com/analytics/script.js",
      },
    ];
  },
  // Security headers: https://nextjs.org/docs/app/building-your-application/configuring/progressive-web-apps#8-securing-your-application
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js needs these
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
              // Needed for Tailwind/Shadcn
              "style-src 'self' 'unsafe-inline' https:",
              // Add this line to allow data: fonts
              "font-src 'self' data: https:",
              // For images including avatars and Mux thumbnails
              "img-src 'self' data: https: blob: https://image.mux.com https://*.litix.io",
              // For Mux video and audio content
              "media-src 'self' blob: https://*.mux.com",
              // If you use web workers or service workers
              "worker-src 'self' blob:",
              // For API calls, SWR, external services, and Mux
              "connect-src 'self' https: wss: https://*.mux.com https://*.litix.io",
              // iframes for Mux player
              "frame-src 'self' https:",
              // Prevent embedding in iframes
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: env.NEXT_PUBLIC_BASE_URL,
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval'",
          },
        ],
      },
    ];
  },
};

const sentryOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: !process.env.CI,
  org: process.env.SENTRY_ORGANIZATION,
  project: process.env.SENTRY_PROJECT,
};

const sentryConfig = {
  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Transpiles SDK to be compatible with IE11 (increases bundle size)
  transpileClientSDK: true,

  // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors.
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
};

const mdxConfig = withMDX(nextConfig);

const useSentry =
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  process.env.SENTRY_ORGANIZATION &&
  process.env.SENTRY_PROJECT;

const exportConfig = useSentry
  ? withSentryConfig(mdxConfig, { ...sentryOptions, ...sentryConfig })
  : mdxConfig;

// NEXTAUTH_SECRET is deprecated but kept as an option to not break the build. At least one must be set.
if (!env.AUTH_SECRET && !env.NEXTAUTH_SECRET) {
  throw new Error(
    "Either AUTH_SECRET or NEXTAUTH_SECRET environment variable must be defined",
  );
}

if (env.MICROSOFT_CLIENT_ID && !env.MICROSOFT_WEBHOOK_CLIENT_STATE) {
  throw new Error(
    "MICROSOFT_WEBHOOK_CLIENT_STATE environment variable must be defined",
  );
}

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: env.NODE_ENV !== "production",
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB
});

export default withAxiom(withSerwist(exportConfig));
