import { VoiceRequestError, VoiceUnavailableError } from "@/utils/voice/errors";
import { NextResponse } from "next/server";

export function voiceErrorResponse(error: unknown) {
  if (error instanceof VoiceUnavailableError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof VoiceRequestError) {
    return NextResponse.json(
      { error: error.message },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 502,
      },
    );
  }
  throw error;
}
