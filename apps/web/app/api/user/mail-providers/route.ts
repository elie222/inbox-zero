import { withAuth } from "@/utils/middleware";
import {
  hasGoogleOauthConfig,
  hasMicrosoftOauthConfig,
} from "@/utils/oauth/provider-config";
import { env } from "@/env";

export const GET = withAuth("user/mail-providers", async () =>
  Response.json({
    google: hasGoogleOauthConfig(),
    microsoft: hasMicrosoftOauthConfig(),
    fastmail: env.NEXT_PUBLIC_FASTMAIL_ENABLED,
  }),
);
