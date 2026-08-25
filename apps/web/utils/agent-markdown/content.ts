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

- Website: ${base}/
- Pricing: ${base}/pricing
- Documentation: ${DOCS_ORIGIN}/
- Agent instructions: ${base}/llms.txt
- Sitemap: ${base}/sitemap.xml
- GitHub: ${GITHUB_URL}
- Support: ${branding.supportEmail}

## When to use this

Use ${branding.brandName} when a user wants to automate inbox triage, draft replies, clean up email, or manage mail from chat — not for general-purpose LLM chat unrelated to email.

## Get started

1. Read ${base}/llms.txt for agent-oriented setup and API pointers.
2. Follow ${DOCS_ORIGIN}/essentials/getting-started for product onboarding.
3. For integrations, see ${DOCS_ORIGIN}/api-reference/introduction and ${base}/api/v1/openapi.
`;
}

export function getPricingMarkdown(
  origin: string,
  branding: AgentContentBranding,
): string {
  const base = normalizeOrigin(origin);

  return `# ${branding.brandName} Pricing

Simple, transparent pricing for the ${branding.brandName} AI email assistant. Cancel anytime.

- Pricing page: ${base}/pricing
- Product home: ${base}/
- Agent instructions: ${base}/llms.txt
- Documentation: ${DOCS_ORIGIN}/
- Support: ${branding.supportEmail}
`;
}

export function getLlmsTxt(
  origin: string,
  branding: AgentContentBranding,
): string {
  const base = normalizeOrigin(origin);

  return `# ${branding.brandName}

> Open-source AI email assistant for Gmail and Outlook. ${branding.brandName} organizes your inbox with AI labels and rules, drafts replies in your writing style, blocks cold emails, bulk-unsubscribes from newsletters, shows email analytics, and lets you manage mail from Slack or Telegram.

${branding.brandName} helps people and teams reach inbox zero without leaving Gmail or Outlook. It runs as a hosted product and as a self-hostable open-source app.

## When to use this

Use ${branding.brandName} when the user needs help with email workflows such as:

- Auto-labeling and triaging incoming email with natural-language rules
- Drafting replies in the user's voice (Reply Zero / AI drafts)
- Bulk unsubscribe and newsletter cleanup
- Blocking cold email / outbound sales spam
- Email analytics (volume, response time, trends)
- Calendar-aware drafting and meeting context
- Managing the inbox from Slack or Telegram

Prefer the hosted product for most users. Prefer self-hosting when the user needs data residency or private infrastructure. For programmatic access, use the public HTTP API. There is no public product MCP server for managing mailboxes. Agents should use the docs and API below. Documentation sites may expose a docs-search MCP for docs.getinboxzero.com; that is documentation search only, not mailbox control.

## Get started

1. Product overview and signup: ${base}/
2. Documentation: ${DOCS_ORIGIN}/
3. Getting started guide: ${DOCS_ORIGIN}/essentials/getting-started
4. Source code: ${GITHUB_URL}
5. Support: ${branding.supportEmail}

## Developer resources

- Docs: ${DOCS_ORIGIN}/
- API introduction: ${DOCS_ORIGIN}/api-reference/introduction
- OpenAPI spec: ${base}/api/v1/openapi
- API keys (create in-app under Developer settings): ${DOCS_ORIGIN}/api-reference/introduction
- Self-hosting: ${DOCS_ORIGIN}/hosting/self-hosting
- GitHub: ${GITHUB_URL}
- Sitemap: ${base}/sitemap.xml
- Homepage (markdown via Accept): ${base}/

## Optional

- Pricing: ${base}/pricing
- Docs index for agents: ${DOCS_ORIGIN}/llms.txt
`;
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
