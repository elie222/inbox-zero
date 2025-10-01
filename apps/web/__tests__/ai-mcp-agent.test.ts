import { describe, expect, test, vi, beforeEach } from "vitest";
import { mcpAgent } from "@/utils/ai/mcp/mcp-agent";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getEmailAccount, getEmail } from "@/__tests__/helpers";
import { tool } from "ai";
import { z } from "zod";

// Run with: pnpm test-ai ai-mcp-agent

vi.mock("server-only", () => ({}));

// Mock the MCP tools creation to return actual tools for testing
vi.mock("@/utils/ai/mcp/mcp-tools", () => ({
  createMcpToolsForAgent: vi.fn(),
}));

const TIMEOUT = 30_000; // Longer timeout for LLM calls

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)(
  "mcpAgent",
  () => {
    beforeEach(async () => {
      vi.clearAllMocks();
    });

    function getTestEmailAccount(): EmailAccountWithAI {
      return getEmailAccount({
        id: "test-account-id",
        userId: "test-user-id",
        about: "Test user working on email automation",
        account: {
          provider: "gmail",
        },
      });
    }

    // Mock HubSpot tools for CRM research
    function getMockHubSpotTools() {
      return {
        "hubspot-search-contacts": {
          description: "Search for contacts in HubSpot CRM",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query for contacts",
              },
              email: {
                type: "string",
                description: "Email address to search for",
              },
            },
            required: ["query"],
          },
          execute: vi
            .fn()
            .mockImplementation(
              async ({ query, email }: { query: string; email?: string }) => {
                return JSON.stringify({
                  contacts: [
                    {
                      id: "12345",
                      email: "customer@acmecorp.com",
                      firstName: "John",
                      lastName: "Smith",
                      company: "ACME Corp",
                      jobTitle: "CEO",
                      phone: "+1-555-0123",
                      dealStage: "customer",
                      lifeCycleStage: "customer",
                      lastContactDate: "2024-01-10",
                      notes:
                        "Enterprise customer, subscribed to Pro plan. Previous billing issues resolved in December 2023.",
                      tags: ["VIP", "Enterprise", "Pro Plan"],
                    },
                  ],
                  totalResults: 1,
                });
              },
            ),
        },
        "hubspot-search-deals": {
          description: "Search for deals in HubSpot CRM",
          parameters: {
            type: "object",
            properties: {
              contactEmail: {
                type: "string",
                description: "Contact email to find deals for",
              },
              companyName: {
                type: "string",
                description: "Company name to search deals for",
              },
            },
          },
          execute: vi
            .fn()
            .mockImplementation(
              async ({
                contactEmail,
                companyName,
              }: {
                contactEmail?: string;
                companyName?: string;
              }) => {
                return JSON.stringify({
                  deals: [
                    {
                      id: "deal-456",
                      dealName: "ACME Corp - Enterprise Upgrade",
                      amount: 50_000,
                      stage: "proposal",
                      closeDate: "2024-02-15",
                      probability: 75,
                      contactId: "12345",
                      notes:
                        "Interested in upgrading from Pro to Enterprise plan. Discussed advanced features and dedicated support.",
                    },
                  ],
                  totalResults: 1,
                });
              },
            ),
        },
      };
    }

    // Mock real Notion tools using AI SDK format
    function getMockNotionTools() {
      return {
        "notion-search": tool({
          description:
            "Perform a search over your entire Notion workspace and connected sources",
          inputSchema: z.object({
            query: z
              .string()
              .min(1)
              .describe(
                "Semantic search query over your entire Notion workspace",
              ),
            query_type: z
              .enum(["internal", "user"])
              .optional()
              .describe(
                "Specify type of the query as either 'internal' or 'user'",
              ),
            filters: z
              .object({
                created_date_range: z
                  .object({
                    start_date: z.string().optional(),
                    end_date: z.string().optional(),
                  })
                  .optional(),
                created_by_user_ids: z.array(z.string()).max(100).optional(),
              })
              .optional(),
            page_url: z
              .string()
              .optional()
              .describe("URL or ID of a page to search within"),
            teamspace_id: z
              .string()
              .optional()
              .describe("ID of a teamspace to restrict search results to"),
            data_source_url: z
              .string()
              .optional()
              .describe("URL of a Data source to search"),
          }),
          execute: async ({ query }: { query: string }) => {
            return `# API Documentation Search Results

Found relevant information for "${query}":

## API Rate Limits and Troubleshooting
**Page ID:** 12345678-90ab-cdef-1234-567890abcdef
**Created:** 2024-01-14
**Last Modified:** 2024-01-15

### Rate Limits
- **/users endpoint:** 100 requests per minute per API key
- **/contacts endpoint:** 200 requests per minute per API key
- **Global rate limit:** 1000 requests per hour per account

### Common 429 Errors
When you exceed rate limits, you'll receive a 429 status code. The response includes:
- \`Retry-After\` header indicating when to retry
- Error message with specific endpoint that was rate limited

### Solutions
1. **Implement exponential backoff** - Start with 1 second delay, double on each retry
2. **Request queuing** - Queue requests and process them within rate limits
3. **Monitor usage** - Track your API usage in the developer dashboard

### Developer Contact
For API key issues or rate limit increases, contact: api-support@company.com`;
          },
        }),
        "notion-fetch": tool({
          description:
            "Retrieves details about a Notion entity by its URL or ID",
          inputSchema: z.object({
            id: z
              .string()
              .describe("The ID or URL of the Notion page to fetch"),
          }),
          execute: async ({ id }: { id: string }) => {
            if (
              id.includes("api-troubleshooting") ||
              id.includes("12345678-90ab-cdef")
            ) {
              return `# API Troubleshooting Guide

**Page ID:** 12345678-90ab-cdef-1234-567890abcdef
**Created:** January 14, 2024
**Last Modified:** January 15, 2024
**Created by:** API Team <api-team@company.com>

## Quick Reference
- Rate limits: 100 req/min per endpoint
- Authentication: Bearer tokens required
- Error codes: 400, 401, 403, 429, 500

## Detailed Troubleshooting Steps
1. Check API key validity
2. Verify endpoint permissions
3. Monitor rate limit headers
4. Implement proper error handling

## Contact Information
- API Support: api-support@company.com  
- Emergency: +1-555-API-HELP
- Documentation: https://docs.company.com/api`;
            }

            if (id.includes("billing") || id.includes("fedcba09-8765")) {
              return `# Billing Management Guide

**Page ID:** fedcba09-8765-4321-fedc-ba0987654321
**Created:** January 12, 2024
**Last Modified:** January 13, 2024
**Created by:** Billing Team <billing@company.com>

## Account Management
- View current plan and usage
- Update payment methods
- Download invoices and receipts
- Manage team members

## Plan Upgrades
Enterprise customers get:
- Dedicated support manager
- SLA guarantees (99.9% uptime)  
- Custom integrations
- Advanced security (SSO, SCIM)
- Unlimited API usage

## Common Issues
1. **Double Charging**: Pre-auth holds, resolves in 3-5 days
2. **Payment Failures**: Update card in settings
3. **Plan Changes**: Prorated automatically

Contact: billing@company.com or call +1-555-BILLING`;
            }

            return `# Page Not Found

The requested page "${id}" could not be found or you don't have access to it.`;
          },
        }),
      };
    }

    test(
      "researches customer context using HubSpot CRM for billing inquiry",
      async () => {
        const emailAccount = getTestEmailAccount();
        const messages = [
          getEmail({
            id: "email-1",
            from: "customer@acmecorp.com",
            to: "support@test.com",
            subject: "Billing issue with subscription",
            content:
              "Hi, I'm John Smith from ACME Corp. We're having issues with our Pro subscription billing. It seems we were charged twice this month. Our account ID is ACME-12345.",
          }),
        ];

        // Mock MCP tools to return HubSpot tools
        const { createMcpToolsForAgent } = await import(
          "@/utils/ai/mcp/mcp-tools"
        );
        vi.mocked(createMcpToolsForAgent).mockResolvedValue(
          getMockHubSpotTools(),
        );

        const result = await mcpAgent({
          emailAccount,
          messages,
        });

        expect(result).not.toBeNull();
        expect(result?.response).toBeTruthy(); // Found relevant customer info

        const toolCalls = result?.getToolCalls();
        expect(toolCalls?.length).toBeGreaterThan(0);
        const toolNames = toolCalls?.map((tc) => tc.toolName);
        expect(toolNames?.some((name) => name.includes("hubspot"))).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "searches knowledge base using Notion for technical support inquiry",
      async () => {
        const emailAccount = getTestEmailAccount();
        const messages = [
          getEmail({
            id: "email-1",
            from: "developer@startup.com",
            to: "api-support@test.com",
            subject: "API integration issues",
            content:
              "Hello, I'm Sarah from DevStartup Inc. We're integrating your REST API but getting 429 rate limit errors on the /users endpoint. Our API key is dev-12345. This is blocking our product launch next week.",
          }),
        ];

        // Mock MCP tools to return Notion tools
        const { createMcpToolsForAgent } = await import(
          "@/utils/ai/mcp/mcp-tools"
        );
        vi.mocked(createMcpToolsForAgent).mockResolvedValue(
          getMockNotionTools(),
        );

        const result = await mcpAgent({
          emailAccount,
          messages,
        });

        expect(result).not.toBeNull();
        expect(result?.response).toBeTruthy(); // Found relevant API documentation

        const response = result?.response?.toLowerCase();
        expect(response).toMatch(/rate limit|api|429|troubleshooting/);

        const toolCalls = result?.getToolCalls();
        expect(toolCalls?.length).toBeGreaterThan(0);
        const toolNames = toolCalls?.map((tc) => tc.toolName);
        expect(toolNames?.some((name) => name.includes("notion"))).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "combines multiple MCP tools for comprehensive research",
      async () => {
        const emailAccount = getTestEmailAccount();
        const messages = [
          getEmail({
            id: "email-1",
            from: "customer@acmecorp.com",
            to: "support@test.com",
            subject: "Enterprise upgrade questions",
            content:
              "Hi, this is John from ACME Corp again. We're interested in upgrading to your Enterprise plan. Can you provide details about the features and pricing? We're particularly interested in API rate limits and dedicated support.",
          }),
        ];

        // Mock MCP tools to return both HubSpot and Notion tools
        const { createMcpToolsForAgent } = await import(
          "@/utils/ai/mcp/mcp-tools"
        );
        vi.mocked(createMcpToolsForAgent).mockResolvedValue({
          ...getMockHubSpotTools(),
          ...getMockNotionTools(),
        });

        const result = await mcpAgent({
          emailAccount,
          messages,
        });

        expect(result).not.toBeNull();
        expect(result?.response).toBeTruthy(); // Found relevant information from multiple sources

        const toolCalls = result?.getToolCalls();
        expect(toolCalls?.length).toBeGreaterThan(0);
        const toolNames = toolCalls?.map((tc) => tc.toolName) ?? [];

        // Should use multiple types of tools for comprehensive research
        const hasHubSpot = toolNames.some((name) => name.includes("hubspot"));
        const hasNotion = toolNames.some((name) => name.includes("notion"));
        expect(hasHubSpot && hasNotion).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "returns null when no MCP tools are available",
      async () => {
        const emailAccount = getTestEmailAccount();
        const messages = [
          getEmail({
            from: "test@example.com",
            subject: "Test inquiry",
            content: "This is a test message.",
          }),
        ];

        // Mock MCP tools to return empty object (no tools available)
        const { createMcpToolsForAgent } = await import(
          "@/utils/ai/mcp/mcp-tools"
        );
        vi.mocked(createMcpToolsForAgent).mockResolvedValue({});

        const result = await mcpAgent({
          emailAccount,
          messages,
        });

        expect(result).toBeNull();
      },
      TIMEOUT,
    );

    test(
      "returns null for empty messages",
      async () => {
        const emailAccount = getTestEmailAccount();

        const result = await mcpAgent({
          emailAccount,
          messages: [],
        });

        expect(result).toBeNull();
      },
      TIMEOUT,
    );
  },
  TIMEOUT,
);
