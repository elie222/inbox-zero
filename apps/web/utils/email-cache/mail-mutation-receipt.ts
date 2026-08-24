import { z } from "zod";

export const mailMutationReceiptResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("missing") }),
  z.object({ status: z.literal("processing") }),
  z.object({
    status: z.literal("applied"),
    result: z.object({ messageId: z.string(), threadId: z.string() }),
  }),
  z.object({ status: z.literal("uncertain") }),
]);
