import { z } from "zod";
import { tb } from "./client";

const PRIVACY_MODE =
  process.env.PRIVACY_MODE === "true" ||
  process.env.NEXT_PUBLIC_PRIVACY_MODE === "true";

const tinybirdEmailAction = z.object({
  ownerEmail: z.string(),
  threadId: z.string(),
  action: z.enum(["archive", "delete"]),
  actionSource: z.enum(["user", "automation"]),
  timestamp: z.number(),
});

export type TinybirdEmailAction = z.infer<typeof tinybirdEmailAction>;

export const publishEmailAction = PRIVACY_MODE
  ? async (
      _params: Omit<TinybirdEmailAction, "action"> & {
        action: "archive" | "delete";
      },
    ) => {
      return;
    }
  : tb.buildIngestEndpoint({
      datasource: "email_action",
      event: tinybirdEmailAction,
    });

// Helper functions for specific actions
export const publishArchive = (params: Omit<TinybirdEmailAction, "action">) => {
  return publishEmailAction({ ...params, action: "archive" });
};

export const publishDelete = (params: Omit<TinybirdEmailAction, "action">) => {
  return publishEmailAction({ ...params, action: "delete" });
};
