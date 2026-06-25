import { getProviderData as getPostHogProviderData } from "@flags-sdk/posthog";
import { mergeProviderData } from "flags";
import { createFlagsDiscoveryEndpoint } from "flags/next";
import { env } from "@/env";
import { getMarketingFlagsProviderData } from "@/utils/marketing/flags";

export const runtime = "nodejs";

export const GET = createFlagsDiscoveryEndpoint(
  async () => {
    const localData = getMarketingFlagsProviderData();

    if (!env.POSTHOG_API_SECRET || !env.POSTHOG_PROJECT_ID) {
      return {
        ...localData,
        hints: [
          ...localData.hints,
          {
            key: "posthog-provider",
            text: "Set POSTHOG_API_SECRET and POSTHOG_PROJECT_ID to load PostHog flag metadata.",
          },
        ],
      };
    }

    return mergeProviderData([
      localData,
      getPostHogProviderData({
        personalApiKey: env.POSTHOG_API_SECRET,
        projectId: env.POSTHOG_PROJECT_ID,
      }),
    ]);
  },
  { secret: env.FLAGS_SECRET },
);
