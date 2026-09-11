import { beforeEach, describe, expect, it, vi } from "vitest";
import staticOpenApiDocument from "../../../docs/openapi.json";

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
    const apiKeyAuth = docs.components?.securitySchemes?.ApiKeyAuth;
    expect(apiKeyAuth).toMatchObject({
      type: "apiKey",
      name: "API-Key",
      "x-scopes": {
        STATS_READ: expect.any(String),
        RULES_READ: expect.any(String),
        RULES_WRITE: expect.any(String),
      },
    });
    expect(docs.components?.securitySchemes).not.toHaveProperty("ApiKeyScopes");

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
    expect(
      docs.paths?.["/stats/by-period"]?.get?.["x-required-scopes"],
    ).toEqual(["STATS_READ"]);
    expect(docs.paths?.["/rules"]?.post?.security).toEqual([
      { ApiKeyAuth: ["RULES_WRITE"] },
    ]);
    expect(docs.paths?.["/rules"]?.post?.["x-required-scopes"]).toEqual([
      "RULES_WRITE",
    ]);
    expect(docs.paths?.["/rules"]?.post?.responses?.["405"]).toBeTruthy();
    expect(JSON.stringify(docs)).not.toContain('"nullable"');
  });

  it("only advertises configured servers", async () => {
    const { createPublicOpenApiDocument } = await import(
      "@/utils/public-openapi"
    );
    const docs = createPublicOpenApiDocument();

    expect(docs.servers).toEqual([
      {
        url: "https://www.getinboxzero.com/api/v1",
        description: "Primary server",
      },
    ]);
  });

  it("keeps the checked-in document in sync", async () => {
    const { createPublicOpenApiDocument } = await import(
      "@/utils/public-openapi"
    );

    expect(staticOpenApiDocument).toEqual(createPublicOpenApiDocument());
  });
});
