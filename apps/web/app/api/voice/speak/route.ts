import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { assertHasAiAccess } from "@/utils/premium/limits";
import { SafeError } from "@/utils/error";
import { voiceErrorResponse } from "@/utils/voice/api-error";
import { requireVoiceCapability } from "@/utils/voice/factory";
import { toUtterances } from "@/utils/voice/speakable";
import {
  getConfiguredVoiceProvider,
  getVoiceRuntime,
} from "@/utils/voice/runtime";
import { speakVoiceBody } from "@/utils/voice/validation";

export const maxDuration = 60;

export const POST = withEmailAccount("voice/speak", async (request) => {
  const { emailAccountId } = request.auth;
  const user = await getEmailAccountWithAi({ emailAccountId });
  if (!user) throw new SafeError("Email account not found", 404);

  await assertHasAiAccess({
    userId: user.userId,
    hasUserApiKey: !!user.user.aiApiKey,
  });

  const json = await request.json();
  const parsed = speakVoiceBody.safeParse(json);
  if (!parsed.success) {
    throw new SafeError("Nothing to speak.", 400);
  }

  try {
    const runtime = getVoiceRuntime(user.user);
    const provider = getConfiguredVoiceProvider(user.user);
    const synthesize = requireVoiceCapability(provider, "synthesize");
    const utterance =
      toUtterances(parsed.data.text)[0] ?? parsed.data.text.trim();
    request.logger.info("Speaking voice sample", {
      chars: utterance.length,
      provider: provider.id,
    });
    const clip = await synthesize({
      text: utterance,
      voiceId: parsed.data.voiceId || runtime.ttsVoice || "alloy",
      signal: request.signal,
    });
    return new NextResponse(Buffer.from(clip.bytes), {
      headers: {
        "content-type": clip.mimeType,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return voiceErrorResponse(error, request.logger);
  }
});
