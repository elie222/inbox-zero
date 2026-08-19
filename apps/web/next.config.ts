import { withSentryConfig } from "@sentry/nextjs";
import { withAxiom } from "next-axiom";
import nextMdx from "@next/mdx";
import { realpathSync } from "node:fs";
import path from "node:path";
import { env } from "./env";
import type { NextConfig } from "next";

const withMDX = nextMdx({
  options: {
    remarkPlugins: [[require.resolve("remark-gfm")]],
  },
});

const isDevelopment = process.env.NODE_ENV === "development";
const isProductionBuild = process.env.NODE_ENV === "production";
const playwrightRunId = process.env.PLAYWRIGHT_RUN_ID;
const repoRoot = path.resolve(import.meta.dirname, "../..");
const nextPackageRoot = path.dirname(
  realpathSync(require.resolve("next/package.json")),
);
const turbopackRoot = commonAncestorPath(repoRoot, nextPackageRoot);
const zodV4CorePath = path.join(
  path.dirname(require.resolve("zod/package.json")),
  "v4/core/index.js",
);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Sequential Playwright feature groups use separate dev servers. Isolating
  // their caches prevents a new Turbopack process from restoring stale tasks.
  ...(playwrightRunId
    ? {
        distDir: path.join(".tmp", "playwright", playwrightRunId, "next"),
      }
    : {}),
  experimental:
    isDevelopment || isProductionBuild
      ? {
          // Next 16.3 defaults this to true (tsc CLI). Stay on the compiler
          // API while on TypeScript 6 so next build keeps filtering test/
          // mock diagnostics instead of failing on known test-only debt.
          useTypeScriptCli: false,
          ...(isDevelopment
            ? {
                // This app has a large route graph. Avoid front-loading all
                // route modules into memory at startup during local
                // development.
                preloadEntriesOnStart: false,
                // Playwright already isolates feature groups in short-lived
                // dev servers. Restarting one mid-test aborts active requests.
                ...(playwrightRunId
                  ? { devMemoryThresholdRestart: false }
                  : {}),
              }
            : {}),
          ...(isProductionBuild
            ? {
                // Keep the static build from fanning out too many workers at
                // once. This trades a bit of build time for lower peak RAM.
                // Docker image builds share Depot workers; keep concurrency
                // even lower there to avoid OOM keepalive failures.
                staticGenerationMaxConcurrency:
                  process.env.DOCKER_BUILD === "true" ? 2 : 4,
                staticGenerationMinPagesPerWorker: 100,
              }
            : {}),
        }
      : {
          useTypeScriptCli: false,
        },
  // Security headers: https://nextjs.org/docs/app/building-your-application/configuring/progressive-web-apps#8-securing-your-application
  async headers() {
    const securityHeaders = [
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
    ];

    return [
      {
        headers: [
          ...securityHeaders,
          {
            key: "Access-Control-Allow-Origin",
            value: env.NEXT_PUBLIC_BASE_URL,
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
        ],
        // Apply all security headers + static CORS to non-auth routes
        source: "/((?!api/auth).*)",
      },
      {
        headers: securityHeaders,
        // Auth routes: security headers only, CORS handled by better-auth based on trustedOrigins
        source: "/api/auth/:path*",
      },
      {
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
        source: "/sw.js",
      },
    ];
  },
  images: {
    deviceSizes: [
      640, 750, 828, 1080, 1200, 1280, 1440, 1920, 2048, 2560, 3840,
    ],
    remotePatterns: [
      {
        hostname: "img.youtube.com",
        protocol: "https",
      },
      {
        hostname: "image.mux.com",
        protocol: "https",
      },
      {
        hostname: "ph-avatars.imgix.net",
        protocol: "https",
      },
      {
        hostname: "lh3.googleusercontent.com",
        protocol: "https",
      },
      {
        hostname: "cdn.sanity.io",
        protocol: "https",
      },
      {
        hostname: "images.getinboxzero.com",
        protocol: "https",
      },
      {
        hostname: "t1.gstatic.com",
        protocol: "https",
      },
      {
        hostname: "cdn.outrank.so",
        protocol: "https",
      },
    ],
  },
  logging: {
    browserToTerminal: true,
  },
  onDemandEntries: isDevelopment
    ? {
        maxInactiveAge: 25 * 1000,
        pagesBufferLength: 2,
      }
    : undefined,
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  reactStrictMode: true,
  async redirects() {
    return [
      {
        destination: "/automation",
        has: [
          {
            key: "__Secure-better-auth.session_token",
            type: "cookie",
          },
        ],
        permanent: false,
        source: "/",
      },
      {
        destination: "/setup",
        has: [
          {
            key: "__Secure-better-auth.session-token.1",
            type: "cookie",
          },
        ],
        permanent: false,
        source: "/",
      },
      {
        destination: "https://go.getinboxzero.com/feature-requests",
        permanent: true,
        source: "/feature-requests",
      },
      {
        destination: "https://go.getinboxzero.com/feature-requests",
        permanent: true,
        source: "/roadmap",
      },
      {
        destination: "https://go.getinboxzero.com/feedback",
        permanent: true,
        source: "/feedback",
      },
      {
        destination: "https://go.getinboxzero.com/changelog",
        permanent: true,
        source: "/changelog",
      },
      {
        destination: "https://go.getinboxzero.com/x",
        permanent: true,
        source: "/twitter",
      },
      {
        destination: "https://go.getinboxzero.com/github",
        permanent: true,
        source: "/github",
      },
      {
        destination:
          "https://apps.apple.com/app/inbox-zero-ai-email/id6759736561",
        permanent: false,
        source: "/ios",
      },
      {
        destination:
          "https://play.google.com/store/apps/details?id=com.getinboxzero.app",
        permanent: false,
        source: "/android",
      },
      {
        destination: "https://go.getinboxzero.com/discord",
        permanent: true,
        source: "/discord",
      },
      {
        destination: "https://go.getinboxzero.com/linkedin",
        permanent: true,
        source: "/linkedin",
      },
      {
        destination: "/support",
        permanent: true,
        source: "/contact",
      },
      {
        destination: "https://go.getinboxzero.com/waitlist",
        permanent: true,
        source: "/waitlist",
      },
      {
        destination: "https://go.getinboxzero.com/waitlist-other",
        permanent: false,
        source: "/waitlist-other",
      },
      {
        destination: "https://go.getinboxzero.com/affiliate",
        permanent: true,
        source: "/affiliates",
      },
      {
        destination: "/bulk-unsubscribe",
        permanent: false,
        source: "/newsletters",
      },
      {
        destination: "https://docs.getinboxzero.com",
        permanent: true,
        source: "/docs",
      },
      {
        destination: "https://docs.getinboxzero.com/:path*",
        permanent: true,
        source: "/docs/:path*",
      },
      {
        destination: "https://docs.getinboxzero.com",
        permanent: true,
        source: "/api-reference/cli",
      },
      {
        destination: "/early-access",
        permanent: true,
        source: "/request-access",
      },
      {
        destination: "/reply-zero",
        permanent: false,
        source: "/reply-tracker",
      },
      {
        destination: "/",
        permanent: true,
        source: "/new-senders",
      },
      {
        destination: "https://go.getinboxzero.com/game",
        permanent: false,
        source: "/game",
      },
      {
        destination: "https://go.getinboxzero.com/soc2",
        permanent: true,
        source: "/soc2",
      },
      {
        destination: "https://go.getinboxzero.com/sales",
        permanent: false,
        source: "/sales",
      },
    ];
  },
  async rewrites() {
    return [
      {
        destination: "https://app.posthog.com/:path*",
        source: "/ingest/:path*",
      },
      {
        destination: "https://lmsqueezy.com/affiliate.js",
        source: "/vendor/lemon/affiliate.js",
      },
      {
        destination: "https://api.dub.co/track/:path",
        source: "/_proxy/dub/track/:path",
      },
      {
        destination: "https://www.dubcdn.com/analytics/script.js",
        source: "/_proxy/dub/script.js",
      },
    ];
  },
  serverExternalPackages: [
    "@chat-adapter/teams",
    "@sentry/nextjs",
    "@sentry/node",
    "@vercel/queue",
    "bullmq",
    "mammoth",
    "unpdf",
  ],
  turbopack: {
    root: turbopackRoot,
    rules: {
      "*.svg": {
        as: "*.js",
        loaders: ["@svgr/webpack"],
      },
    },
  },
  // Skip TypeScript checking during Docker/E2E CI builds to save memory.
  // App typechecking is covered by the Build Check workflow.
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPE_CHECK === "true",
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "zod/v4/core": zodV4CorePath,
    };
    return config;
  },
};

const sentryOptions = {
  org: process.env.SENTRY_ORGANIZATION,
  project: process.env.SENTRY_PROJECT,
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: !process.env.CI,
};

const sentryConfig = {
  // Enables automatic instrumentation of Vercel Cron Monitors.
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,
  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
  tunnelRoute: "/monitoring",
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

// The service worker is built separately by `serwist build` (serwist.config.mjs)
// because the @serwist/next webpack plugin doesn't support Turbopack.

export default withAxiom(exportConfig);

function commonAncestorPath(firstPath: string, secondPath: string) {
  const [firstParts, secondParts] = [firstPath, secondPath].map((value) =>
    path.resolve(value).split(path.sep),
  );
  const commonParts: string[] = [];

  for (let index = 0; index < firstParts.length; index += 1) {
    if (firstParts[index] !== secondParts[index]) break;
    commonParts.push(firstParts[index]);
  }

  if (commonParts.length === 1 && commonParts[0] === "") {
    return path.sep;
  }

  // A bare Windows drive is relative to that drive's current directory.
  if (commonParts.length === 1 && /^[A-Za-z]:$/.test(commonParts[0] ?? "")) {
    return `${commonParts[0]}${path.sep}`;
  }

  return commonParts.join(path.sep);
}
