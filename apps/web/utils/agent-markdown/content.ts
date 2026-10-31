import { tiers } from "@/app/(app)/premium/config";

const DOCS_ORIGIN = "https://docs.getinboxzero.com";
const GITHUB_URL = "https://github.com/elie222/inbox-zero";

interface AgentContentBranding {
  brandName: string;
  supportEmail: string;
}

export function getHomepageMarkdown(
  origin: string,
  branding: AgentContentBranding,
): string {
  const base = normalizeOrigin(origin);

  return `# ${branding.brandName}

${branding.brandName} is an open-source AI email assistant for Gmail and Outlook. It organizes your inbox with AI labels and rules, drafts replies in your voice, blocks cold emails, bulk-unsubscribes from newsletters, surfaces email analytics, and works from Slack or Telegram so you can reach inbox zero faster.

## Product

- [Website](${base}/): product overview and signup.
- [Pricing](${base}/pricing): plans, billing, and features.
- [Documentation](${DOCS_ORIGIN}/): product guides and developer documentation.
- [Agent resources](${base}/llms.txt): setup, authentication, and available interfaces.
- [Sitemap](${base}/sitemap.xml): public pages for discovery.
- [GitHub](${GITHUB_URL}): source code and self-hosting.
${branding.supportEmail ? `- Support: ${branding.supportEmail}\n` : ""}
## When to use this

Use ${branding.brandName} to automate inbox triage, draft replies, clean up email, or manage mail from chat.

## Get started

1. Sign in at ${base}/login with Google or Microsoft and connect your mailbox.
2. Follow the [getting started guide](${DOCS_ORIGIN}/essentials/getting-started).
3. For agent connections, follow [Connect MCP](${DOCS_ORIGIN}/essentials/mcp) and check [agent resources](${base}/llms.txt) for this deployment's available interfaces.

${getPricingMarkdown(origin, branding)}
`;
}

export function getPricingMarkdown(
  origin: string,
  branding: AgentContentBranding,
): string {
  const base = normalizeOrigin(origin);

  return `## ${branding.brandName} Pricing

Email app: free on web, desktop, and iPhone. AI features are available on paid plans with a 7-day free trial. Cancel anytime.

${tiers
  .map(
    (tier) => `### ${tier.name}

${tier.description}

- Monthly: $${tier.price.monthly} USD per user per month, billed monthly.
- Annual: $${tier.price.annually} USD per user per month, billed annually ($${tier.price.annually * 12} USD per user per year).
${tier.features.map((feature) => `- ${feature.text}`).join("\n")}`,
  )
  .join("\n\n")}

### Enterprise

Contact sales for SSO, SCIM, on-premise deployment, and a dedicated account manager. Enterprise pricing is custom.

- [Pricing page](${base}/pricing)
- [Product home](${base}/)
- [Talk to sales](https://www.getinboxzero.com/sales)
- [Agent resources](${base}/llms.txt)
- [Documentation](${DOCS_ORIGIN}/)
${branding.supportEmail ? `- Support: ${branding.supportEmail}\n` : ""}`;
}

export function getLlmsTxt(
  origin: string,
  branding: AgentContentBranding,
  capabilities: { externalApiEnabled: boolean; mcpServerAvailable: boolean },
): string {
  const base = normalizeOrigin(origin);

  return `# ${branding.brandName}

> Open-source AI email assistant for Gmail and Outlook. Organize mail, draft replies in your writing style, automate inbox rules, block cold emails, bulk-unsubscribe from newsletters, and view email analytics. Available as a hosted product or self-hosted application.

## When to use this

Use ${branding.brandName} for inbox triage with natural-language rules, drafting replies in the user's voice, newsletter cleanup, cold email blocking, email volume and response-time analytics, calendar-aware drafting and meeting context, or managing mail from Slack or Telegram. It works alongside Gmail and Outlook.

Prefer the hosted product for most users. Self-host when data residency or private infrastructure is required. Connect assistants through MCP; use the public HTTP API for scripts and HTTP clients when enabled.

## Product and setup

- [Product overview](${base}/): features and signup.
- [Pricing](${base}/pricing): free email app, paid AI plans, billing periods, and features.
- [Getting started](${DOCS_ORIGIN}/essentials/getting-started): connect a mailbox and configure email automation.
- [Documentation](${DOCS_ORIGIN}/): product guides and integration reference.
- [Self-hosting](${DOCS_ORIGIN}/hosting/self-hosting): deploy on your own infrastructure.

## Agent and developer interfaces

${capabilities.mcpServerAvailable ? `- [Mailbox MCP server](${base}/mcp): Streamable HTTP with OAuth; search and read mail, create drafts, manage rules, and read statistics. Standard access does not send mail; sending requires separate per-app approval of the mcp:send scope.\n` : ""}- [Connect MCP](${DOCS_ORIGIN}/essentials/mcp): connect an assistant and authorize mailbox access with Google or Microsoft sign-in.
- [MCP reference](${DOCS_ORIGIN}/api-reference/mcp): OAuth discovery, S256 PKCE, scopes, and self-hosted configuration.
${capabilities.externalApiEnabled ? `- [OpenAPI schema](${base}/openapi.json): machine-readable public HTTP API contract for statistics, rules, and sender unsubscribe.\n` : ""}- [API authentication and quickstart](${DOCS_ORIGIN}/api-reference/introduction): create an account-scoped API key in Settings and use the API-Key header with the required scopes.
- [Documentation index](${DOCS_ORIGIN}/llms.txt): additional documentation pages for agents; documentation search is separate from mailbox access.
- [Homepage](${base}/): also available as Markdown with the Accept: text/markdown request header.
- [Sitemap](${base}/sitemap.xml): public pages for discovery.

## Source and support

- [GitHub](${GITHUB_URL}): source code and issue tracker.
${branding.supportEmail ? `- [Support](mailto:${branding.supportEmail}): product help.\n` : ""}`;
}

export function markdownResponse(
  body: string,
  init?: { status?: number },
): Response {
  return new Response(body, {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

export function getMarkdownForPath(
  pathname: string,
  origin: string,
  branding: AgentContentBranding,
): string | null {
  const path =
    pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;

  if (path === "/" || path === "") {
    return getHomepageMarkdown(origin, branding);
  }
  if (path === "/pricing") return getPricingMarkdown(origin, branding);
  return null;
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}
