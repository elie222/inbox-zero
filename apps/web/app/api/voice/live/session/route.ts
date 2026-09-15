import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { assertHasAiAccess } from "@/utils/premium/limits";
import { SafeError } from "@/utils/error";
import { voiceErrorResponse } from "@/utils/voice/api-error";
import { requireVoiceCapability } from "@/utils/voice/factory";
import { LIVE_VOICE_INSTRUCTIONS } from "@/utils/voice/instructions";
import {
  getConfiguredVoiceProvider,
  getVoiceRuntime,
} from "@/utils/voice/runtime";
import { liveSessionBody } from "@/utils/voice/validation";

export const maxDuration = 60;

export type CreateLiveVoiceSessionResponse = {
  sessionId: string;
  sdp: string;
};

export const POST = withEmailAccount("voice/live/session", async (request) => {
  const { emailAccountId } = request.auth;
  const user = await getEmailAccountWithAi({ emailAccountId });
  if (!user) throw new SafeError("Email account not found", 404);

  await assertHasAiAccess({
    userId: user.userId,
    hasUserApiKey: !!user.user.aiApiKey,
  });

  const json = await request.json();
  const parsed = liveSessionBody.safeParse(json);
  if (!parsed.success) {
    throw new SafeError("A connection offer is required.", 400);
  }

  try {
    const runtime = getVoiceRuntime(user.user);
    const provider = getConfiguredVoiceProvider(user.user);
    const createLiveSession = requireVoiceCapability(provider, "live");
    request.logger.info("Creating live voice session", {
      historyCount: parsed.data.history?.length ?? 0,
      provider: provider.id,
    });
    const session = await createLiveSession({
      sdp: parsed.data.sdp,
      instructions: LIVE_VOICE_INSTRUCTIONS,
      voiceId: runtime.liveVoice,
      history: parsed.data.history,
      signal: request.signal,
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return voiceErrorResponse(error);
  }
});
