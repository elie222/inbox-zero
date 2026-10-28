import { sso } from "@better-auth/sso";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { isAdmin } from "@/utils/admin";

const managementPaths = new Set([
  "/sso/register",
  "/sso/providers",
  "/sso/get-provider",
  "/sso/update-provider",
  "/sso/delete-provider",
  "/sso/request-domain-verification",
  "/sso/verify-domain",
]);

export function adminSso(options: Parameters<typeof sso>[0]) {
  // The SSO declaration omits its runtime hooks; retain them through the plugin contract.
  const plugin: ReturnType<typeof sso> & Pick<BetterAuthPlugin, "hooks"> =
    sso(options);
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      before: [
        {
          matcher: (context: { path?: string }) =>
            managementPaths.has(context.path ?? ""),
          // Plugin hooks protect both HTTP and server API calls, unlike route middleware.
          handler: createAuthMiddleware(async (context) => {
            const session = await getSessionFromCtx(context);
            if (!session?.user) throw new APIError("UNAUTHORIZED");
            if (!isAdmin({ email: session.user.email })) {
              throw new APIError("FORBIDDEN");
            }
          }),
        },
        ...(plugin.hooks?.before ?? []),
      ],
    },
  };
}
