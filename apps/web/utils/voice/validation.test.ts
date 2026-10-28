import { describe, expect, it } from "vitest";
import { SafeError } from "@/utils/error";
import { decodeAudioBase64 } from "./validation";

describe("decodeAudioBase64", () => {
  it("decodes audio bytes", () => {
    const encoded = Buffer.from([1, 2, 3, 4]).toString("base64");
    expect(Array.from(decodeAudioBase64(encoded))).toEqual([1, 2, 3, 4]);
  });

  it("rejects empty recordings", () => {
    expect(() => decodeAudioBase64("")).toThrow(SafeError);
  });
});
