import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { assertHasAiAccess } from "@/utils/premium/limits";
import { SafeError } from "@/utils/error";
import { voiceErrorResponse } from "@/utils/voice/api-error";
import { requireVoiceCapability } from "@/utils/voice/factory";
import { getConfiguredVoiceProvider } from "@/utils/voice/runtime";
import {
  decodeAudioBase64,
  transcribeVoiceBody,
} from "@/utils/voice/validation";

export const maxDuration = 60;

export type TranscribeVoiceResponse = { text: string };

export const POST = withEmailAccount("voice/transcribe", async (request) => {
  const { emailAccountId } = request.auth;
  const user = await getEmailAccountWithAi({ emailAccountId });
  if (!user) throw new SafeError("Email account not found", 404);

  await assertHasAiAccess({
    userId: user.userId,
    hasUserApiKey: !!user.user.aiApiKey,
  });

  const json = await request.json();
  const parsed = transcribeVoiceBody.safeParse(json);
  if (!parsed.success) {
    throw new SafeError("Recording is required.", 400);
  }

  const audio = decodeAudioBase64(parsed.data.audioBase64);

  try {
    const provider = getConfiguredVoiceProvider(user.user);
    const transcribe = requireVoiceCapability(provider, "transcribe");
    request.logger.info("Transcribing voice", {
      bytes: audio.byteLength,
      mimeType: parsed.data.mimeType,
      provider: provider.id,
    });
    const result = await transcribe({
      audio,
      mimeType: parsed.data.mimeType,
      signal: request.signal,
    });
    return NextResponse.json({ text: result.text });
  } catch (error) {
    return voiceErrorResponse(error, request.logger);
  }
});
