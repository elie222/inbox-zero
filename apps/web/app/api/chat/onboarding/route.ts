import { NextResponse } from "next/server";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { aiProcessOnboardingChat } from "@/utils/ai/onboarding/chat";
import { onboardingChatInputSchema } from "@/app/api/chat/onboarding/validation";

export const maxDuration = 120;

// The onboarding chat is ephemeral: the client keeps the full conversation and
// sends it with every request, so nothing is persisted server-side.
export const POST = withEmailAccount("onboarding-chat", async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const user = await getEmailAccountWithAi({ emailAccountId });
  if (!user) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  const json = await request.json();
  const { data, error } = onboardingChatInputSchema.safeParse(json);
  if (error) {
    request.logger.warn("Onboarding chat request rejected", {
      validationIssueCodes: [...new Set(error.issues.map((i) => i.code))],
    });
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    modelMessages = await convertToModelMessages(data.messages as UIMessage[], {
      ignoreIncompleteToolCalls: true,
    });
  } catch (error) {
    request.logger.warn("Onboarding chat messages failed to convert", {
      error,
    });
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await aiProcessOnboardingChat({
      messages: modelMessages,
      emailAccountId,
      user,
      setup: data.setup,
      scan: data.scan,
      isPremium: data.isPremium,
      logger: request.logger,
    });

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    request.logger.error("Error in onboarding chat", { error });
    return NextResponse.json(
      { error: "Error in onboarding chat" },
      { status: 500 },
    );
  }
});
