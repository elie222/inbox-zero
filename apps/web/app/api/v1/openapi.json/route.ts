import { getPublicOpenApiResponse } from "@/utils/public-openapi";
import { createPublicApiMethodNotAllowedHandler } from "@/utils/public-api-error";
import { withError } from "@/utils/middleware";

export const POST = createPublicApiMethodNotAllowedHandler(["GET"]);
export const PUT = createPublicApiMethodNotAllowedHandler(["GET"]);
export const PATCH = createPublicApiMethodNotAllowedHandler(["GET"]);
export const DELETE = createPublicApiMethodNotAllowedHandler(["GET"]);

export const GET = withError("v1/openapi.json", async () =>
  getPublicOpenApiResponse(),
);
