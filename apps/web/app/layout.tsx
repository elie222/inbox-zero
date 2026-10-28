import { Suspense } from "react";
import type { Metadata } from "next";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AxiomWebVitals } from "next-axiom";
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics as DubAnalytics } from "@dub/analytics/react";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import type {
  Graph,
  Offer,
  Organization,
  SoftwareApplication,
  WebSite,
} from "schema-dts";
import "../styles/globals.css";
import { tiers } from "@/app/(app)/premium/config";
import { PostHogPageview, PostHogProvider } from "@/providers/PostHogProvider";
import { env } from "@/env";
import { GlobalProviders } from "@/providers/GlobalProviders";
import { UTM } from "@/app/utm";
import { startupImage } from "@/app/startup-image";
import { Toaster } from "@/components/Toast";
import {
  CookieConsentBanner,
  WithCookieConsent,
} from "@/components/CookieConsent";
import {
  BRAND_ICON_URL,
  BRAND_NAME,
  SUPPORT_EMAIL,
  toAbsoluteUrl,
} from "@/utils/branding";
import { isIndexingAllowed } from "@/utils/indexing";
import { isMcpServerAvailable } from "@/utils/mcp/config";

const aeonikFont = localFont({
  src: "../styles/aeonik-medium.woff",
  variable: "--font-title",
  preload: true,
  display: "swap",
});
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const title = `${BRAND_NAME} | Automate and clean your inbox`;
const description =
  "Your AI executive assistant to reach inbox zero fast. Automate emails, bulk unsubscribe, block cold emails, and analytics. Open-source";

const indexingAllowed = isIndexingAllowed(env.NEXT_PUBLIC_BASE_URL);

const organizationId = toAbsoluteUrl("/#organization");
const websiteId = toAbsoluteUrl("/#website");

const organization: Organization = {
  "@type": "Organization",
  "@id": organizationId,
  name: BRAND_NAME,
  url: env.NEXT_PUBLIC_BASE_URL,
  logo: {
    "@type": "ImageObject",
    url: toAbsoluteUrl(BRAND_ICON_URL),
  },
  sameAs: [
    "https://x.com/inboxzero_ai",
    "https://github.com/elie222/inbox-zero",
  ],
  ...(SUPPORT_EMAIL
    ? {
        contactPoint: {
          "@type": "ContactPoint" as const,
          email: SUPPORT_EMAIL,
          contactType: "customer support",
        },
      }
    : {}),
  address: {
    "@type": "PostalAddress",
    streetAddress: "131 Continental Dr, Suite 305",
    addressLocality: "Newark",
    addressRegion: "DE",
    postalCode: "19713",
    addressCountry: "US",
  },
};

const website: WebSite = {
  "@type": "WebSite",
  "@id": websiteId,
  name: BRAND_NAME,
  alternateName: ["InboxZero", "getinboxzero"],
  url: env.NEXT_PUBLIC_BASE_URL,
  publisher: { "@id": organizationId },
};

const softwareApplication: SoftwareApplication = {
  "@type": "SoftwareApplication",
  name: BRAND_NAME,
  description,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: env.NEXT_PUBLIC_BASE_URL,
  featureList: [
    "AI Email Assistant",
    "Email Automation",
    "Bulk Unsubscribe",
    "Cold Email Blocking",
    "Email Analytics",
    "Newsletter Management",
  ],
  offers: subscriptionOffers(),
  publisher: { "@id": organizationId },
};

const jsonLd: Graph = {
  "@context": "https://schema.org",
  "@graph": [organization, website, softwareApplication],
};

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: BRAND_NAME,
    type: "website",
    url: env.NEXT_PUBLIC_BASE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    creator: "@inboxzero_ai",
  },
  metadataBase: new URL(env.NEXT_PUBLIC_BASE_URL),
  // issues with robots.txt: https://github.com/vercel/next.js/issues/58615#issuecomment-1852457285
  robots: {
    index: indexingAllowed,
    follow: indexingAllowed,
  },
  // pwa
  applicationName: BRAND_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRAND_NAME,
    startupImage,
  },
  formatDetection: {
    telephone: false,
  },
  // safe area for iOS PWA
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "white-translucent",
  },
};

export const viewport = {
  themeColor: "#FFF",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Vercel only serves the /_vercel/* analytics scripts on its own platform;
  // elsewhere they 404 and are blocked by strict MIME checking.
  const isVercel = process.env.VERCEL === "1";

  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link
          rel="alternate"
          type="text/plain"
          href="/llms.txt"
          title={`${BRAND_NAME} agent resources`}
        />
        <link
          rel="help"
          href="https://docs.getinboxzero.com/essentials/getting-started"
          title="Getting started"
        />
        {env.NEXT_PUBLIC_EXTERNAL_API_ENABLED && (
          <link
            rel="service-desc"
            type="application/vnd.oai.openapi+json;version=3.1"
            href="/openapi.json"
            title={`${BRAND_NAME} API`}
          />
        )}
        {isMcpServerAvailable() && (
          <link
            rel="service-doc"
            href="https://docs.getinboxzero.com/essentials/mcp"
            title="Connect to the mailbox MCP server"
          />
        )}
      </head>
      <body
        className={`h-full ${env.NEXT_PUBLIC_USE_AEONIK_FONT ? aeonikFont.variable : ""} ${geist.variable} font-sans antialiased`}
      >
        <script
          // Marks the Mac Electron shell before paint so traffic-light
          // insets apply without a logo flash. Harmless in the browser.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static UA check, no user input
          dangerouslySetInnerHTML={{
            __html:
              'if(window.inboxZeroDesktop&&/Mac/i.test(navigator.userAgent))document.documentElement.dataset.macDesktop=""',
          }}
        />
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify on controlled object is safe
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
        <PostHogProvider>
          <Suspense>
            <PostHogPageview />
          </Suspense>
          <GlobalProviders>
            {children}
            <Toaster />
          </GlobalProviders>
        </PostHogProvider>
        {isVercel && <Analytics />}
        <AxiomWebVitals />
        <UTM />
        {isVercel && <SpeedInsights />}
        <WithCookieConsent>
          {env.NEXT_PUBLIC_DUB_REFER_DOMAIN && (
            <DubAnalytics
              apiHost="/_proxy/dub"
              scriptProps={{ src: "/_proxy/dub/script.js" }}
              domainsConfig={{ refer: env.NEXT_PUBLIC_DUB_REFER_DOMAIN }}
            />
          )}
          {env.NEXT_PUBLIC_GTM_ID ? (
            <GoogleTagManager gtmId={env.NEXT_PUBLIC_GTM_ID} />
          ) : null}
        </WithCookieConsent>
        <CookieConsentBanner />
      </body>
    </html>
  );
}

function subscriptionOffers(): Offer[] {
  return tiers.flatMap((tier) => [
    subscriptionOffer({
      name: tier.name,
      price: tier.price.monthly,
      billingDuration: "P1M",
    }),
    subscriptionOffer({
      name: `${tier.name} annual`,
      price: tier.price.annually * 12,
      billingDuration: "P1Y",
    }),
  ]);
}

function subscriptionOffer({
  name,
  price,
  billingDuration,
}: {
  name: string;
  price: number;
  billingDuration: string;
}): Offer {
  return {
    "@type": "Offer",
    name,
    price: price.toFixed(2),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price,
      priceCurrency: "USD",
      billingDuration,
    },
  };
}
