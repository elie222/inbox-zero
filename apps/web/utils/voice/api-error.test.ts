import { describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { voiceErrorResponse } from "./api-error";
import { VoiceRequestError, VoiceUnavailableError } from "./errors";

const logger = createScopedLogger("voice-api-error-test");

describe("voiceErrorResponse", () => {
  it("returns VoiceUnavailableError messages as-is", async () => {
    const response = voiceErrorResponse(
      new VoiceUnavailableError("key", "No voice provider is configured."),
      logger,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "No voice provider is configured.",
    });
  });

  it("hides provider diagnostics from the client", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const response = voiceErrorResponse(
      new VoiceRequestError(
        "OpenAI failed while synthesizing: Invalid voice 'secret-voice-id'",
        400,
      ),
      logger,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "That voice request could not be processed.",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "Voice provider request failed",
      expect.objectContaining({
        status: 400,
        error:
          "OpenAI failed while synthesizing: Invalid voice 'secret-voice-id'",
      }),
    );
    errorSpy.mockRestore();
  });

  it("maps unauthorized, rate-limited, and generic failures", async () => {
    await expect(
      voiceErrorResponse(new VoiceRequestError("nope", 401), logger).json(),
    ).resolves.toEqual({
      error: "Voice is not authorized. Check the provider key.",
    });
    await expect(
      voiceErrorResponse(new VoiceRequestError("slow", 429), logger).json(),
    ).resolves.toEqual({
      error: "Voice is rate limited. Try again in a moment.",
    });
    await expect(
      voiceErrorResponse(new VoiceRequestError("boom", 500), logger).json(),
    ).resolves.toEqual({
      error: "Voice failed. Try again.",
    });
  });
});
