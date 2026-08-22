import { withError } from "@/utils/middleware";
import { getPublicOpenApiResponse } from "@/utils/public-openapi";

export const GET = withError("v1/openapi", async (request) => {
  const { searchParams } = new URL(request.url);
  const customHost = searchParams.get("host") ?? undefined;

  return getPublicOpenApiResponse({
    customHost,
    contentType: "application/json",
  });
});
