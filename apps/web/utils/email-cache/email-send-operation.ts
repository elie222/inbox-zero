import { z } from "zod";

export const emailSendOperationResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("missing") }),
  z.object({ status: z.literal("processing") }),
  z.object({
    status: z.literal("sent"),
    result: z.object({ messageId: z.string(), threadId: z.string() }),
  }),
  z.object({ status: z.literal("uncertain") }),
]);
