import { z } from "zod";

export const deleteChatBody = z.object({
  chatId: z.string().trim().min(1),
});
export type DeleteChatBody = z.infer<typeof deleteChatBody>;

export const renameChatFormBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});
export type RenameChatFormBody = z.infer<typeof renameChatFormBody>;

export const renameChatBody = renameChatFormBody.extend({
  chatId: z.string().trim().min(1),
});
export type RenameChatBody = z.infer<typeof renameChatBody>;
