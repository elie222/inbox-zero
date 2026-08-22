import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EXTERNAL_API_ENABLED: true,
    NEXT_PUBLIC_BASE_URL: "https://www.getinboxzero.com",
  },
}));

vi.mock("@/utils/branding", () => ({
  BRAND_NAME: "Inbox Zero",
}));

describe("createPublicOpenApiDocument", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("includes unique operationIds, scopes, and typed error responses", async () => {
    const { createPublicOpenApiDocument } = await import(
      "@/utils/public-openapi"
    );
    const docs = createPublicOpenApiDocument();

    expect(docs.openapi).toBe("3.1.0");
    expect(docs.components?.securitySchemes?.ApiKeyAuth).toMatchObject({
      type: "apiKey",
      name: "API-Key",
    });
    expect(docs.components?.securitySchemes?.ApiKeyScopes).toMatchObject({
      type: "oauth2",
    });
    expect(
      (
        docs.components?.securitySchemes?.ApiKeyScopes as {
          flows?: { clientCredentials?: { scopes?: Record<string, string> } };
        }
      ).flows?.clientCredentials?.scopes,
    ).toMatchObject({
      STATS_READ: expect.any(String),
      RULES_READ: expect.any(String),
      RULES_WRITE: expect.any(String),
    });

    const operationIds: string[] = [];
    for (const pathItem of Object.values(docs.paths ?? {})) {
      for (const operation of Object.values(pathItem ?? {})) {
        if (!operation || typeof operation !== "object") continue;
        if (!("operationId" in operation)) continue;
        operationIds.push(String(operation.operationId));
        expect(operation.description).toBeTruthy();
        expect(operation.responses?.["401"]).toBeTruthy();
      }
    }

    expect(operationIds).toEqual([
      "getStatsByPeriod",
      "getStatsResponseTime",
      "listRules",
      "createRule",
      "getRule",
      "replaceRule",
      "deleteRule",
    ]);
    expect(new Set(operationIds).size).toBe(operationIds.length);

    expect(docs.paths?.["/stats/by-period"]?.get?.security).toEqual([
      { ApiKeyAuth: ["STATS_READ"] },
    ]);
    expect(docs.paths?.["/rules"]?.post?.security).toEqual([
      { ApiKeyAuth: ["RULES_WRITE"] },
    ]);
  });
});
