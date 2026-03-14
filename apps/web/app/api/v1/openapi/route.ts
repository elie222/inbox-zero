import { NextResponse } from "next/server";
import { z } from "zod";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import {
  OpenAPIRegistry,
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
import { env } from "@/env";
import { BRAND_NAME } from "@/utils/branding";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";

extendZodWithOpenApi(z);

export const GET = withError("v1/openapi", async (request) => {
  if (!env.NEXT_PUBLIC_EXTERNAL_API_ENABLED) {
    throw new SafeError("External API is not enabled");
  }

  const { searchParams } = new URL(request.url);
  const customHost = searchParams.get("host");

  const registry = createRegistry();
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const docs = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: `${BRAND_NAME} API`,
      version: "1.0.0",
    },
    servers: [
      ...(customHost
        ? [{ url: `${customHost}/api/v1`, description: "Custom host" }]
        : []),
      {
        url: `${env.NEXT_PUBLIC_BASE_URL}/api/v1`,
        description: "Primary server",
      },
      { url: "http://localhost:3000/api/v1", description: "Local development" },
    ],
    security: [{ ApiKeyAuth: [] }],
  });

  return new NextResponse(JSON.stringify(docs), {
    headers: { "Content-Type": "application/json" },
  });
});

function createRegistry() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent("securitySchemes", "ApiKeyAuth", {
    type: "apiKey",
    in: "header",
    name: API_KEY_HEADER,
  });

  registry.registerPath({
    method: "get",
    path: "/stats/by-period",
    description:
      "Get email statistics grouped by time period. Returns counts of emails by status (all, sent, read, unread, archived, unarchived) for each period.",
    security: [{ ApiKeyAuth: [] }],
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
    },
  });

  registry.registerPath({
    method: "get",
    path: "/stats/response-time",
    description:
      "Get email response time statistics. Returns summary stats, distribution, and trend data showing how quickly you respond to emails.",
    security: [{ ApiKeyAuth: [] }],
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
    },
  });

  registry.registerPath({
    method: "get",
    path: "/rules",
    description: "List automation rules for the scoped inbox account.",
    security: [{ ApiKeyAuth: [] }],
    responses: {
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: rulesResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/rules",
    description: "Create an automation rule for the scoped inbox account.",
    security: [{ ApiKeyAuth: [] }],
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
    },
  });

  registry.registerPath({
    method: "get",
    path: "/rules/{id}",
    description: "Get a single automation rule for the scoped inbox account.",
    security: [{ ApiKeyAuth: [] }],
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
    },
  });

  registry.registerPath({
    method: "put",
    path: "/rules/{id}",
    description: "Replace an automation rule for the scoped inbox account.",
    security: [{ ApiKeyAuth: [] }],
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
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/rules/{id}",
    description: "Delete an automation rule for the scoped inbox account.",
    security: [{ ApiKeyAuth: [] }],
    request: {
      params: rulePathParamsSchema,
    },
    responses: {
      204: {
        description: "Rule deleted",
      },
    },
  });

  return registry;
}
