import { encodeThreadId } from "@chat-adapter/teams";
import { Card, CardText } from "chat";
import { z } from "zod";
import { env } from "@/env";
import { getMessagingChatSdkBot } from "@/utils/messaging/chat-sdk/bot";

const installationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("installationUpdate"),
  action: z.literal("add"),
  channelId: z.literal("msteams"),
  serviceUrl: z.url(),
  conversation: z.object({
    id: z.string().min(1),
    conversationType: z.literal("personal"),
  }),
});

// Call only after the Teams adapter has authenticated the webhook.
export async function sendTeamsInstallationWelcome(activity: unknown) {
  const parsed = installationSchema.safeParse(activity);
  if (!parsed.success) return;

  const { bot, adapters } = getMessagingChatSdkBot();
  const adapter = adapters.teams;
  if (!adapter) return;

  const { id, conversation, serviceUrl } = parsed.data;
  const state = bot.getState();
  const key = `teams:welcome:${conversation.id}:${id}`;
  if (await state.get(key)) return;
  const lock = await state.acquireLock(key, 15_000);
  if (!lock) throw new Error("Teams welcome delivery is already in progress");

  const baseUrl = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  try {
    if (await state.get(key)) return;
    await adapter.postMessage(
      encodeThreadId({ conversationId: conversation.id, serviceUrl }),
      Card({
        title: "Welcome to Inbox Zero",
        children: [
          CardText(
            "Manage email with your AI assistant in Microsoft Teams. Ask for summaries, help organizing your inbox, and draft replies for review.",
          ),
          CardText(
            `An active Inbox Zero account is required. Sign in or sign up at ${baseUrl}.`,
          ),
          CardText(
            `Open ${baseUrl}/channels, select Connect for Microsoft Teams, then send the generated /connect <code> command in this chat.`,
          ),
          CardText(
            `Type /help for commands. Setup and help: ${baseUrl}/docs/essentials/channels. Contact ${env.NEXT_PUBLIC_SUPPORT_EMAIL}.`,
          ),
          CardText(
            `AI-generated content may be inaccurate. Review before using it. Report objectionable AI-generated content to ${env.NEXT_PUBLIC_SUPPORT_EMAIL}.`,
          ),
        ],
      }),
    );
    await state.set(key, true, 24 * 60 * 60 * 1000);
  } finally {
    await state.releaseLock(lock);
  }
}
