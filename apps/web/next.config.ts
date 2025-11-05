import { withSentryConfig } from "@sentry/nextjs";
import { withAxiom } from "next-axiom";
import nextMdx from "@next/mdx";
import withSerwistInit from "@serwist/next";
import { env } from "./env";
import type { NextConfig } from "next";

const withMDX = nextMdx({
  options: {
    remarkPlugins: [[require.resolve("remark-gfm")]],
  },
});

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
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "image.mux.com",
      },
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
    ];
  },
  async rewrites() {
    if (env.PRIVACY_MODE) return [];
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
          (() => {
            const base = [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
              "style-src 'self' 'unsafe-inline' https:",
              "font-src 'self' data: https:",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ];
            if (env.PRIVACY_MODE) {
              // lock down client-side network calls in privacy mode
              base.push("img-src 'self' data: blob:");
              base.push("media-src 'self' blob:");
              base.push("connect-src 'self'");
              base.push("frame-src 'self'");
            } else {
              base.push(
                "img-src 'self' data: https: blob: https://image.mux.com https://*.litix.io",
              );
              base.push("media-src 'self' blob: https://*.mux.com");
              base.push(
                "connect-src 'self' https: wss: https://*.mux.com https://*.litix.io",
              );
              base.push("frame-src 'self' https:");
            }
            return {
              key: "Content-Security-Policy",
              value: base.join("; "),
            };
          })(),
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000",
          },
          // Access-Control-Allow-Origin is set dynamically at runtime via middleware
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
  !env.PRIVACY_MODE &&
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

const withAxiomMaybe: (c: NextConfig) => NextConfig = env.PRIVACY_MODE
  ? (c) => c
  : withAxiom;

export default withAxiomMaybe(withSerwist(exportConfig));
