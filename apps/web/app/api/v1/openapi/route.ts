import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import {
  groupEmailsQuerySchema,
  groupEmailsResponseSchema,
} from "@/app/api/v1/group/[groupId]/emails/validation";
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
  path: "/group/{groupId}/emails",
  description: "Get group emails",
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({
      groupId: z
        .string()
        .describe(
          "You can find the group id by going to `https://www.getinboxzero.com/automation?tab=groups`, clicking `Matching Emails`, and then copying the id from the URL.",
        ),
    }),
    query: groupEmailsQuerySchema,
  },
  responses: {
    200: {
      description: "Successful response",
      content: {
        "application/json": {
          schema: groupEmailsResponseSchema,
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
        url: "https://getinboxzero.com/api/v1",
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
