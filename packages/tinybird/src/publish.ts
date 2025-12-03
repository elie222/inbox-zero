import { z } from "zod";
import { isTinybirdEnabled, tb } from "./client";

const tinybirdEmailAction = z.object({
  ownerEmail: z.string(),
  threadId: z.string(),
  action: z.enum(["archive", "delete"]),
  actionSource: z.enum(["user", "automation"]),
  timestamp: z.number(),
});

export type TinybirdEmailAction = z.infer<typeof tinybirdEmailAction>;

const tinybirdPublishEmailAction = tb.buildIngestEndpoint({
  datasource: "email_action",
  event: tinybirdEmailAction,
});

export async function publishEmailAction(
  event: TinybirdEmailAction,
): Promise<void> {
  if (!isTinybirdEnabled()) return;
  await tinybirdPublishEmailAction(event);
}

// Helper functions for specific actions
export const publishArchive = (params: Omit<TinybirdEmailAction, "action">) => {
  return publishEmailAction({ ...params, action: "archive" });
};

export const publishDelete = (params: Omit<TinybirdEmailAction, "action">) => {
  return publishEmailAction({ ...params, action: "delete" });
};
