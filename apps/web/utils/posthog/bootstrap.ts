import { cache } from "react";
import { uuidv7 } from "uuidv7";
import { PostHog } from "posthog-node";
import { cookies } from "next/headers";
import { env } from "@/env";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

// For PostHog SSR Experiments (A/B Testing)
// Based on: https://posthog.com/tutorials/nextjs-ab-tests

export async function getPosthogBootstrapData() {
  const phProjectAPIKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!phProjectAPIKey) return null;

  const session = await auth();

  const phCookieName = `ph_${phProjectAPIKey}_posthog`;
  const cookieStore = cookies();
  const phCookie = cookieStore.get(phCookieName);

  let distinct_id = "";

  if (session?.user.email) {
    distinct_id = session.user.email;
  } else if (phCookie) {
    const phCookieParsed = JSON.parse(phCookie.value);
    distinct_id = phCookieParsed.distinct_id;
  }
  if (!distinct_id) {
    distinct_id = generateId();
  }

  const client = new PostHog(phProjectAPIKey, {
    host: env.NEXT_PUBLIC_POSTHOG_API_HOST,
  });
  const flags = await client.getAllFlags(distinct_id);
  const bootstrap = {
    distinctID: distinct_id,
    featureFlags: flags,
  };

  return bootstrap;
}

export const generateId = cache(() => {
  const id = uuidv7();
  return id;
});
