import { NextResponse } from "next/server";
import type { Logger } from "@/utils/logger";
import { VoiceRequestError, VoiceUnavailableError } from "@/utils/voice/errors";

export function voiceErrorResponse(error: unknown, logger: Logger) {
  if (error instanceof VoiceUnavailableError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof VoiceRequestError) {
    const status =
      error.status >= 400 && error.status < 600 ? error.status : 502;
    logger.error("Voice provider request failed", {
      status,
      error: error.message,
    });
    return NextResponse.json(
      { error: clientSafeVoiceError(status) },
      { status },
    );
  }
  throw error;
}

function clientSafeVoiceError(status: number): string {
  if (status === 401 || status === 403) {
    return "Voice is not authorized. Check the provider key.";
  }
  if (status === 429) {
    return "Voice is rate limited. Try again in a moment.";
  }
  if (status === 400 || status === 422) {
    return "That voice request could not be processed.";
  }
  return "Voice failed. Try again.";
}
