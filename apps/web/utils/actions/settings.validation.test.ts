import { describe, expect, it } from "vitest";
import { saveAiSettingsBody } from "./settings.validation";
import { DEFAULT_PROVIDER, Provider } from "@/utils/llms/config";

describe("saveAiSettingsBody", () => {
  it("accepts default provider without api key", () => {
    const result = saveAiSettingsBody.safeParse({
      aiProvider: DEFAULT_PROVIDER,
      aiModel: "",
      aiApiKey: undefined,
    });

    expect(result.success).toBe(true);
  });

  it("requires api key for user-selectable providers", () => {
    const result = saveAiSettingsBody.safeParse({
      aiProvider: Provider.OPEN_AI,
      aiModel: "gpt-5.1",
      aiApiKey: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["aiApiKey"]);
    }
  });

  it("rejects vertex as a user-selectable provider", () => {
    const result = saveAiSettingsBody.safeParse({
      aiProvider: Provider.VERTEX,
      aiModel: "gemini-3-flash",
      aiApiKey: "unused-key",
    });

    expect(result.success).toBe(false);
  });
});
