import { withError } from "@/utils/middleware";
import { publicApiErrorResponse } from "@/utils/public-api-error";

async function notFound() {
  return publicApiErrorResponse({
    status: 404,
    code: "NOT_FOUND",
    message: "API route not found",
  });
}

export const GET = withError("v1/catch-all", notFound);
export const POST = withError("v1/catch-all", notFound);
export const PUT = withError("v1/catch-all", notFound);
export const PATCH = withError("v1/catch-all", notFound);
export const DELETE = withError("v1/catch-all", notFound);
