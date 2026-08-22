import { NextResponse } from "next/server";
import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import {
  statsByPeriodQuerySchema,
  statsByPeriodResponseSchema,
} from "@/app/api/v1/stats/by-period/validation";
import {
  responseTimeQuerySchema,
  responseTimeResponseSchema,
} from "@/app/api/v1/stats/response-time/validation";
import {
  rulePathParamsSchema,
  ruleRequestBodySchema,
  ruleResponseSchema,
  rulesResponseSchema,
} from "@/app/api/v1/rules/validation";
import { API_KEY_HEADER } from "@/utils/api-auth";
import {
  API_KEY_SCOPE_OPTIONS,
  type ApiKeyScopeValue,
} from "@/utils/api-key-scopes";
import { env } from "@/env";
import { BRAND_NAME } from "@/utils/branding";
import {
  PUBLIC_API_DOCS_URL,
  PUBLIC_API_OPENAPI_PATH,
  createPublicApiErrorBody,
} from "@/utils/public-api-error";

extendZodWithOpenApi(z);

const publicApiErrorSchema = z
  .object({
    error: z.object({
      code: z.enum([
        "BAD_REQUEST",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "RATE_LIMITED",
        "INTERNAL_ERROR",
      ]),
      message: z.string(),
      hint: z.string(),
    }),
  })
  .openapi("PublicApiError");

const API_KEY_SCOPE_DESCRIPTIONS = Object.fromEntries(
  API_KEY_SCOPE_OPTIONS.map((scope) => [scope.value, scope.description]),
) as Record<(typeof API_KEY_SCOPE_OPTIONS)[number]["value"], string>;

function errorResponses(
  statuses: Array<400 | 401 | 403 | 404 | 429 | 500>,
): Record<
  number,
  {
    description: string;
    content: {
      "application/json": {
        schema: typeof publicApiErrorSchema;
      };
    };
  }
> {
  const descriptions: Record<number, string> = {
    400: "Invalid query, path, or request body",
    401: "Missing, invalid, or expired API key",
    403: "API key lacks a required scope or is not account-scoped",
    404: "Resource or route not found",
    429: "Rate limited by the API or email provider",
    500: "Unexpected server error",
  };

  return Object.fromEntries(
    statuses.map((status) => [
      status,
      {
        description: descriptions[status],
        content: {
          "application/json": {
            schema: publicApiErrorSchema,
          },
        },
      },
    ]),
  );
}

function apiKeySecurity(scopes: ApiKeyScopeValue[]) {
  return [{ ApiKeyAuth: scopes }];
}

export function createPublicOpenApiDocument(options?: { customHost?: string }) {
  const registry = createRegistry();
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: `${BRAND_NAME} API`,
      version: "1.0.0",
      description: [
        `Programmatic access to ${BRAND_NAME} inbox stats and automation rules.`,
        `Docs: ${PUBLIC_API_DOCS_URL}`,
        `Machine-readable schema: ${PUBLIC_API_OPENAPI_PATH}`,
        "Authenticate with an account-scoped API key via the API-Key header.",
        "Errors return JSON with error.code, error.message, and error.hint.",
      ].join(" "),
    },
    servers: [
      ...(options?.customHost
        ? [{ url: `${options.customHost}/api/v1`, description: "Custom host" }]
        : []),
      {
        url: `${env.NEXT_PUBLIC_BASE_URL}/api/v1`,
        description: "Primary server",
      },
      { url: "http://localhost:3000/api/v1", description: "Local development" },
    ],
    security: [{ ApiKeyAuth: [] }],
  });
}

export function getPublicOpenApiResponse(options?: {
  customHost?: string;
  contentType?: string;
}) {
  if (!env.NEXT_PUBLIC_EXTERNAL_API_ENABLED) {
    return NextResponse.json(
      createPublicApiErrorBody({
        code: "NOT_FOUND",
        message: "External API is not enabled",
        hint: "Enable NEXT_PUBLIC_EXTERNAL_API_ENABLED to expose the public API schema.",
      }),
      { status: 404 },
    );
  }

  const docs = createPublicOpenApiDocument({
    customHost: options?.customHost,
  });

  return new NextResponse(JSON.stringify(docs), {
    headers: {
      "Content-Type":
        options?.contentType ?? "application/vnd.oai.openapi+json;version=3.1",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function createRegistry() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent("securitySchemes", "ApiKeyAuth", {
    type: "apiKey",
    in: "header",
    name: API_KEY_HEADER,
    description: [
      "Account-scoped API key created in Settings.",
      "Operations declare the scopes they require.",
      "Available scopes:",
      ...Object.entries(API_KEY_SCOPE_DESCRIPTIONS).map(
        ([scope, description]) => `- ${scope}: ${description}`,
      ),
    ].join("\n"),
  });

  // Machine-readable scope catalog for agents. Auth still uses API-Key;
  // this oauth2 scheme only declares scopes_supported-style metadata.
  registry.registerComponent("securitySchemes", "ApiKeyScopes", {
    type: "oauth2",
    description:
      "API key permission scopes. Create keys with selected scopes in the product Settings UI; send the key via the API-Key header (ApiKeyAuth).",
    flows: {
      clientCredentials: {
        tokenUrl: PUBLIC_API_DOCS_URL,
        scopes: API_KEY_SCOPE_DESCRIPTIONS,
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/stats/by-period",
    operationId: "getStatsByPeriod",
    description:
      "Get email statistics grouped by time period. Returns counts of emails by status (all, sent, read, unread, archived, unarchived) for each period.",
    security: apiKeySecurity(["STATS_READ"]),
    request: {
      query: statsByPeriodQuerySchema,
    },
    responses: {
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: statsByPeriodResponseSchema,
          },
        },
      },
      ...errorResponses([400, 401, 403, 429, 500]),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/stats/response-time",
    operationId: "getStatsResponseTime",
    description:
      "Get email response time statistics. Returns summary stats, distribution, and trend data showing how quickly you respond to emails.",
    security: apiKeySecurity(["STATS_READ"]),
    request: {
      query: responseTimeQuerySchema,
    },
    responses: {
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: responseTimeResponseSchema,
          },
        },
      },
      ...errorResponses([400, 401, 403, 429, 500]),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/rules",
    operationId: "listRules",
    description: "List automation rules for the scoped inbox account.",
    security: apiKeySecurity(["RULES_READ"]),
    responses: {
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: rulesResponseSchema,
          },
        },
      },
      ...errorResponses([401, 403, 429, 500]),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/rules",
    operationId: "createRule",
    description: "Create an automation rule for the scoped inbox account.",
    security: apiKeySecurity(["RULES_WRITE"]),
    request: {
      body: {
        content: {
          "application/json": {
            schema: ruleRequestBodySchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: ruleResponseSchema,
          },
        },
      },
      ...errorResponses([400, 401, 403, 429, 500]),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/rules/{id}",
    operationId: "getRule",
    description: "Get a single automation rule for the scoped inbox account.",
    security: apiKeySecurity(["RULES_READ"]),
    request: {
      params: rulePathParamsSchema,
    },
    responses: {
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: ruleResponseSchema,
          },
        },
      },
      ...errorResponses([400, 401, 403, 404, 429, 500]),
    },
  });

  registry.registerPath({
    method: "put",
    path: "/rules/{id}",
    operationId: "replaceRule",
    description: "Replace an automation rule for the scoped inbox account.",
    security: apiKeySecurity(["RULES_WRITE"]),
    request: {
      params: rulePathParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: ruleRequestBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: ruleResponseSchema,
          },
        },
      },
      ...errorResponses([400, 401, 403, 404, 429, 500]),
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/rules/{id}",
    operationId: "deleteRule",
    description: "Delete an automation rule for the scoped inbox account.",
    security: apiKeySecurity(["RULES_WRITE"]),
    request: {
      params: rulePathParamsSchema,
    },
    responses: {
      204: {
        description: "Rule deleted",
      },
      ...errorResponses([400, 401, 403, 404, 429, 500]),
    },
  });

  return registry;
}
