import { z } from "zod";

export const deleteChatBody = z.object({
  chatId: z.string().trim().min(1),
});
export type DeleteChatBody = z.infer<typeof deleteChatBody>;

export const renameChatBody = z.object({
  chatId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
});
export type RenameChatBody = z.infer<typeof renameChatBody>;
