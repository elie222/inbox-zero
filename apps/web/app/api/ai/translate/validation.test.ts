import { describe, expect, it } from "vitest";
import { translateBody } from "./validation";

describe("translateBody", () => {
  it("accepts BCP 47 language tags and one or more texts", () => {
    expect(
      translateBody.parse({
        texts: ["Hello"],
        targetLanguage: "en",
      }),
    ).toEqual({
      texts: ["Hello"],
      targetLanguage: "en",
    });

    expect(
      translateBody.parse({
        texts: ["Hola", "Mundo"],
        targetLanguage: "es-ES",
      }).targetLanguage,
    ).toBe("es-ES");
  });

  it("rejects empty texts and invalid language tags", () => {
    expect(() =>
      translateBody.parse({
        texts: [],
        targetLanguage: "en",
      }),
    ).toThrow();

    expect(() =>
      translateBody.parse({
        texts: ["Hello"],
        targetLanguage: "not a language!",
      }),
    ).toThrow();
  });
});
