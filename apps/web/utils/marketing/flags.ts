import { createPostHogAdapter } from "@flags-sdk/posthog";
import type { PostHogEntities } from "@flags-sdk/posthog";
import { cookies } from "next/headers";
import {
  evaluate,
  flag,
  getProviderData as getLocalProviderData,
} from "flags/next";
import type { BootstrapConfig } from "posthog-js";
import { env } from "@/env";
import {
  isValidMarketingAnonymousId,
  MARKETING_ANONYMOUS_ID_COOKIE,
} from "@/utils/marketing/identity";

type MarketingFlagValue = string | boolean;

const postHogHost = env.NEXT_PUBLIC_POSTHOG_API_HOST?.startsWith("http")
  ? env.NEXT_PUBLIC_POSTHOG_API_HOST
  : undefined;

const postHogAdapter = env.NEXT_PUBLIC_POSTHOG_KEY
  ? createPostHogAdapter({
      postHogKey: env.NEXT_PUBLIC_POSTHOG_KEY,
      postHogOptions: {
        ...(postHogHost ? { host: postHogHost } : {}),
      },
    })
  : undefined;

const postHogFeatureFlagValue = postHogAdapter?.featureFlagValue();

const identifyMarketingVisitor = async (): Promise<
  PostHogEntities | undefined
> => {
  const cookieStore = await cookies();
  const distinctId = cookieStore.get(MARKETING_ANONYMOUS_ID_COOKIE)?.value;

  if (!isValidMarketingAnonymousId(distinctId)) return;

  return { distinctId };
};

const createMarketingFlag = ({
  key,
  defaultValue,
  description,
  options,
}: {
  defaultValue: MarketingFlagValue;
  description: string;
  key: string;
  options: MarketingFlagValue[];
}) =>
  flag<MarketingFlagValue, PostHogEntities>({
    key,
    defaultValue,
    description,
    options,
    identify: identifyMarketingVisitor,
    ...(postHogFeatureFlagValue
      ? { adapter: postHogFeatureFlagValue }
      : { decide: () => defaultValue }),
  });

export const marketingFlags = {
  heroCopy: createMarketingFlag({
    key: "hero-copy-7",
    defaultValue: "control",
    description: "Landing-page hero copy variant.",
    options: ["control", "clean-up-in-minutes"],
  }),
  pricingOptions: createMarketingFlag({
    key: "pricing-options-2",
    defaultValue: "control",
    description: "Landing-page pricing tier presentation variant.",
    options: ["control", "basic-business", "business-basic"],
  }),
  pricingFrequencyDefault: createMarketingFlag({
    key: "pricing-frequency-default",
    defaultValue: "control",
    description: "Landing-page pricing frequency default.",
    options: ["control", "monthly"],
  }),
  testimonials: createMarketingFlag({
    key: "testimonials",
    defaultValue: "control",
    description: "Landing-page testimonials presentation variant.",
    options: ["control", "senja-widget"],
  }),
  welcomePricingTiers: createMarketingFlag({
    key: "welcome-pricing-tiers",
    defaultValue: "control",
    description: "Welcome upgrade pricing tier presentation variant.",
    options: ["control", "two-tiers"],
  }),
};

export async function getMarketingPostHogBootstrap(): Promise<
  BootstrapConfig | undefined
> {
  const cookieStore = await cookies();
  const distinctID = cookieStore.get(MARKETING_ANONYMOUS_ID_COOKIE)?.value;

  if (!isValidMarketingAnonymousId(distinctID)) return;

  const values = await evaluate(marketingFlags);
  const featureFlags: NonNullable<BootstrapConfig["featureFlags"]> = {};

  for (const [name, flagValue] of Object.entries(values)) {
    const flagDefinition = marketingFlags[name as keyof typeof marketingFlags];
    featureFlags[flagDefinition.key] = flagValue;
  }

  return {
    distinctID,
    isIdentifiedID: false,
    featureFlags,
  };
}

export function getMarketingFlagsProviderData() {
  return getLocalProviderData(marketingFlags);
}
