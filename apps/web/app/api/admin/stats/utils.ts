import { withAdmin } from "@/utils/middleware";
import { type AdminStatsParams, adminStatsParams } from "./types";

/**
 * Admin analogue of createOrgStatsRoute: same param parsing, but gated by
 * withAdmin and with no organization to resolve.
 */
export function createAdminStatsRoute<T>(
  routeName: string,
  getData: (params: AdminStatsParams) => Promise<T>,
) {
  return withAdmin(routeName, async (request) => {
    const { searchParams } = new URL(request.url);
    const queryParams = adminStatsParams.parse({
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    return Response.json(
      await getData({
        fromDate: queryParams.fromDate ?? undefined,
        toDate: queryParams.toDate ?? undefined,
      }),
    );
  });
}

/**
 * Inclusive window. An absent bound means unbounded, not a default window:
 * the date picker sends no dates for "All time", and quietly substituting 30
 * days there would label a month as all time.
 */
export function resolveDateRange({ fromDate, toDate }: AdminStatsParams) {
  return {
    from: fromDate ? new Date(fromDate) : new Date(0),
    to: toDate ? new Date(toDate) : new Date(),
  };
}
