import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";

type GoogleAdsRow = {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
  };
  adGroup?: {
    name?: string;
  };
  searchTermView?: {
    searchTerm?: string;
  };
  conversionAction?: {
    id?: string;
    name?: string;
    status?: string;
    type?: string;
    category?: string;
    primaryForGoal?: boolean;
  };
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: number;
    allConversions?: number;
  };
};

type DbAttributionSummary = {
  googleAdsSignups: number;
  googleAdsTrialConversions: number;
};

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value = "true"] = arg.slice(2).split("=");
      return [key, value] as const;
    }),
);

const days = Number(args.get("days") || 7);
const format = args.get("format") || "markdown";
const end = startOfUtcDay(new Date());
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - days);

async function main() {
  const [campaignRows, searchTermRows, conversionActionRows, dbSummary] =
    await Promise.all([
      googleAdsSearch(campaignQuery(start, end)),
      googleAdsSearch(searchTermQuery(start, end)),
      googleAdsSearch(conversionActionQuery()),
      getDbAttributionSummary(start, end),
    ]);

  const report = {
    range: {
      start: formatDate(start),
      endExclusive: formatDate(end),
      days,
    },
    campaigns: campaignRows.map((row) => ({
      id: row.campaign?.id,
      name: row.campaign?.name,
      status: row.campaign?.status,
      impressions: toNumber(row.metrics?.impressions),
      clicks: toNumber(row.metrics?.clicks),
      costUsd: microsToUsd(row.metrics?.costMicros),
      conversions: row.metrics?.conversions || 0,
      allConversions: row.metrics?.allConversions || 0,
    })),
    searchTerms: searchTermRows.map((row) => ({
      campaign: row.campaign?.name,
      adGroup: row.adGroup?.name,
      term: row.searchTermView?.searchTerm,
      impressions: toNumber(row.metrics?.impressions),
      clicks: toNumber(row.metrics?.clicks),
      costUsd: microsToUsd(row.metrics?.costMicros),
      conversions: row.metrics?.conversions || 0,
      allConversions: row.metrics?.allConversions || 0,
    })),
    conversionActions: conversionActionRows.map((row) => ({
      id: row.conversionAction?.id,
      name: row.conversionAction?.name,
      status: row.conversionAction?.status,
      type: row.conversionAction?.type,
      category: row.conversionAction?.category,
      primaryForGoal: row.conversionAction?.primaryForGoal,
    })),
    appAttribution: dbSummary,
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(toMarkdown(report));
  }
}

function campaignQuery(startDate: Date, endDate: Date) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions
    FROM campaign
    WHERE segments.date >= '${formatDate(startDate)}'
      AND segments.date < '${formatDate(endDate)}'
    ORDER BY metrics.cost_micros DESC
  `;
}

function searchTermQuery(startDate: Date, endDate: Date) {
  return `
    SELECT
      campaign.name,
      ad_group.name,
      search_term_view.search_term,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions
    FROM search_term_view
    WHERE segments.date >= '${formatDate(startDate)}'
      AND segments.date < '${formatDate(endDate)}'
      AND metrics.cost_micros > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 25
  `;
}

function conversionActionQuery() {
  return `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.status,
      conversion_action.type,
      conversion_action.category,
      conversion_action.primary_for_goal
    FROM conversion_action
    ORDER BY conversion_action.name
  `;
}

async function googleAdsSearch(query: string): Promise<GoogleAdsRow[]> {
  const config = getGoogleAdsConfig();
  const accessToken = await getAccessToken(config);
  const response = await fetch(
    `https://googleads.googleapis.com/v24/customers/${config.customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "developer-token": config.developerToken,
        ...(config.loginCustomerId
          ? { "login-customer-id": config.loginCustomerId }
          : {}),
      },
      body: JSON.stringify({ query }),
    },
  );

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`Google Ads query failed: ${JSON.stringify(body)}`);
  }

  return body.results || [];
}

function getGoogleAdsConfig() {
  const clientId =
    process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replaceAll("-", "");
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replaceAll(
    "-",
    "",
  );

  if (!clientId)
    throw new Error("Missing GOOGLE_ADS_CLIENT_ID or GOOGLE_CLIENT_ID");
  if (!clientSecret) {
    throw new Error("Missing GOOGLE_ADS_CLIENT_SECRET or GOOGLE_CLIENT_SECRET");
  }
  if (!developerToken) throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!refreshToken) throw new Error("Missing GOOGLE_ADS_REFRESH_TOKEN");
  if (!customerId) throw new Error("Missing GOOGLE_ADS_CUSTOMER_ID");

  return {
    clientId,
    clientSecret,
    developerToken,
    refreshToken,
    customerId,
    loginCustomerId,
  };
}

async function getAccessToken({
  clientId,
  clientSecret,
  refreshToken,
}: ReturnType<typeof getGoogleAdsConfig>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = await response.json().catch(() => undefined);
  if (!response.ok || !body?.access_token) {
    throw new Error(`Google OAuth refresh failed: ${JSON.stringify(body)}`);
  }

  return body.access_token as string;
}

async function getDbAttributionSummary(
  startDate: Date,
  endDate: Date,
): Promise<DbAttributionSummary | null> {
  if (!process.env.DATABASE_URL) return null;

  const prisma = new PrismaClient();
  try {
    const [row] = await prisma.$queryRaw<
      { google_ads_signups: bigint; google_ads_trial_conversions: bigint }[]
    >`
      SELECT
        COUNT(DISTINCT u.id) FILTER (
          WHERE u."createdAt" >= ${startDate}
            AND u."createdAt" < ${endDate}
            AND (
              u.utms ? 'gclid'
              OR u.utms ? 'gbraid'
              OR u.utms ? 'wbraid'
            )
        ) AS google_ads_signups,
        COUNT(DISTINCT p.id) FILTER (
          WHERE p."stripeTrialConvertedAt" >= ${startDate}
            AND p."stripeTrialConvertedAt" < ${endDate}
            AND (
              u.utms ? 'gclid'
              OR u.utms ? 'gbraid'
              OR u.utms ? 'wbraid'
            )
        ) AS google_ads_trial_conversions
      FROM "User" u
      LEFT JOIN "Premium" p ON p.id = u."premiumId"
    `;

    return {
      googleAdsSignups: Number(row?.google_ads_signups || 0),
      googleAdsTrialConversions: Number(row?.google_ads_trial_conversions || 0),
    };
  } finally {
    await prisma.$disconnect();
  }
}

function toMarkdown(report: Awaited<ReturnType<typeof mainReportShape>>) {
  const campaignLines = report.campaigns
    .map(
      (campaign) =>
        `| ${campaign.name} | ${campaign.status} | ${campaign.costUsd.toFixed(
          2,
        )} | ${campaign.clicks} | ${campaign.impressions} | ${
          campaign.conversions
        } | ${campaign.allConversions} |`,
    )
    .join("\n");

  const searchTermLines = report.searchTerms
    .map(
      (term) =>
        `| ${term.term} | ${term.campaign} | ${term.costUsd.toFixed(2)} | ${
          term.clicks
        } | ${term.impressions} | ${term.conversions} | ${
          term.allConversions
        } |`,
    )
    .join("\n");

  const conversionActionLines = report.conversionActions
    .map(
      (action) =>
        `| ${action.id} | ${action.name} | ${action.status} | ${action.type} | ${action.category} | ${action.primaryForGoal} |`,
    )
    .join("\n");

  return `# Google Ads weekly report

Range: ${report.range.start} to ${report.range.endExclusive} (exclusive)

## Campaigns

| Campaign | Status | Cost | Clicks | Impressions | Conv. | All conv. |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${campaignLines || "| No campaign spend | | 0.00 | 0 | 0 | 0 | 0 |"}

## Search terms

| Search term | Campaign | Cost | Clicks | Impressions | Conv. | All conv. |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${searchTermLines || "| No paid search terms | | 0.00 | 0 | 0 | 0 | 0 |"}

## Conversion actions

| ID | Name | Status | Type | Category | Primary |
| --- | --- | --- | --- | --- | --- |
${conversionActionLines}

## App attribution

- Google Ads first-touch signups: ${report.appAttribution?.googleAdsSignups ?? "DB unavailable"}
- Google Ads first-touch trial-to-paid conversions: ${
    report.appAttribution?.googleAdsTrialConversions ?? "DB unavailable"
  }
`;
}

function mainReportShape() {
  return {
    range: { start: "", endExclusive: "", days: 0 },
    campaigns: [] as {
      id: string | undefined;
      name: string | undefined;
      status: string | undefined;
      impressions: number;
      clicks: number;
      costUsd: number;
      conversions: number;
      allConversions: number;
    }[],
    searchTerms: [] as {
      campaign: string | undefined;
      adGroup: string | undefined;
      term: string | undefined;
      impressions: number;
      clicks: number;
      costUsd: number;
      conversions: number;
      allConversions: number;
    }[],
    conversionActions: [] as {
      id: string | undefined;
      name: string | undefined;
      status: string | undefined;
      type: string | undefined;
      category: string | undefined;
      primaryForGoal: boolean | undefined;
    }[],
    appAttribution: null as DbAttributionSummary | null,
  };
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function microsToUsd(value: string | undefined) {
  return toNumber(value) / 1_000_000;
}

function toNumber(value: string | number | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(value);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
