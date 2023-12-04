"use server";

import { PostHog } from "posthog-node";
import { env } from "@/env.mjs";

async function getPosthogUserId(options: { email: string }) {
  const personsEndpoint = `https://app.posthog.com/api/projects/${env.POSTHOG_PROJECT_ID}/persons/`;

  // 1. find user id by distinct id
  const responseGet = await fetch(
    `${personsEndpoint}?distinct_id=${options.email}`,
    {
      headers: {
        Authorization: `Bearer ${env.POSTHOG_API_SECRET}`,
      },
    },
  );

  const resGet: { results: { id: string; distinct_ids: string[] }[] } =
    await responseGet.json();

  if (!resGet.results?.[0]) {
    console.error(`No Posthog user found with distinct id ${options.email}`);
    return;
  }

  if (!resGet.results[0].distinct_ids?.includes(options.email)) {
    // double check distinct id
    throw new Error(
      `Distinct id ${resGet.results[0].distinct_ids} does not include ${options.email}`,
    );
  }

  const userId = resGet.results[0].id;

  return userId;
}

export async function deletePosthogUser(options: { email: string }) {
  if (!env.POSTHOG_API_SECRET || !env.POSTHOG_PROJECT_ID) {
    console.warn("Posthog env variables not set");
    return;
  }

  // 1. find user id by distinct id
  const userId = await getPosthogUserId(options);

  const personsEndpoint = `https://app.posthog.com/api/projects/${env.POSTHOG_PROJECT_ID}/persons/`;

  // 2. delete user by id
  try {
    await fetch(`${personsEndpoint}${userId}/?delete_events=true`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env.POSTHOG_API_SECRET}`,
      },
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

export async function posthogCaptureEvent(
  email: string,
  event: string,
  properties: any,
) {
  if (!env.POSTHOG_API_SECRET || !env.POSTHOG_PROJECT_ID) {
    console.warn("Posthog env variables not set");
    return;
  }

  const client = new PostHog(env.POSTHOG_API_SECRET);

  const distinctId = await getPosthogUserId({ email });

  if (!distinctId) return;

  client.capture({
    distinctId,
    event,
    properties,
  });

  await client.shutdownAsync();
}
