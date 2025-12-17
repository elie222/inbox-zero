import { type NextRequest, NextResponse } from "next/server";
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
import { API_KEY_HEADER } from "@/utils/api-auth";

extendZodWithOpenApi(z);

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customHost = searchParams.get("host");

  const generator = new OpenApiGeneratorV3(registry.definitions);
  const docs = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Inbox Zero API",
      version: "1.0.0",
    },
    servers: [
      ...(customHost
        ? [{ url: `${customHost}/api/v1`, description: "Custom host" }]
        : []),
      {
        url: "https://www.getinboxzero.com/api/v1",
        description: "Production server",
      },
      { url: "http://localhost:3000/api/v1", description: "Local development" },
    ],
    security: [{ ApiKeyAuth: [] }],
  });

  return new NextResponse(JSON.stringify(docs), {
    headers: { "Content-Type": "application/json" },
  });
}
