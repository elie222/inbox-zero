import { env } from "@/env";

export const AI_GENERATED_FIELD_VALUE = "___AI_GENERATE___";

export const aiHomePath = "/automation";
export const appHomePath = env.NEXT_PUBLIC_DISABLE_TINYBIRD
  ? aiHomePath
  : "/bulk-unsubscribe";

export const GroupName = {
  NEWSLETTER: "Newsletters",
  RECEIPT: "Receipts",
};
