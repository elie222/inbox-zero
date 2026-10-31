import { describe, expect, it } from "vitest";
import { getSendWarnings } from "./send-warnings";

describe("getSendWarnings", () => {
  it("warns when the body mentions an attachment but nothing is attached", () => {
    expect(
      getSendWarnings({
        text: "Hi, I've attached the signed contract.",
        hasAttachments: false,
      }),
    ).toEqual([{ type: "missing-attachment" }]);
  });

  it("does not warn about attachments once a file is attached", () => {
    expect(
      getSendWarnings({
        text: "Please see the attachment.",
        hasAttachments: true,
      }),
    ).toEqual([]);
  });

  it("catches attachment mentions in other languages", () => {
    for (const text of [
      "Te envío el contrato adjunto.",
      "Vous trouverez la pièce jointe ci-dessous.",
      "Anbei die Rechnung.",
    ]) {
      expect(getSendWarnings({ text, hasAttachments: false })).toEqual([
        { type: "missing-attachment" },
      ]);
    }
  });

  it("does not match words that only contain an attachment word", () => {
    expect(
      getSendWarnings({
        text: "Thanks for the reattachment of the cable.",
        hasAttachments: false,
      }),
    ).toEqual([]);
  });

  it("warns about an unfilled placeholder and names it", () => {
    expect(
      getSendWarnings({
        text: "Yes, the discount still applies and the total is [annual price].",
        hasAttachments: false,
      }),
    ).toEqual([
      { type: "unfilled-placeholder", placeholder: "[annual price]" },
    ]);
  });

  it("returns both warnings together", () => {
    expect(
      getSendWarnings({
        text: "Attached is the quote for [company name].",
        hasAttachments: false,
      }).map((warning) => warning.type),
    ).toEqual(["missing-attachment", "unfilled-placeholder"]);
  });

  it("returns nothing for an ordinary reply", () => {
    expect(
      getSendWarnings({
        text: "Sounds good, see you Thursday.",
        hasAttachments: false,
      }),
    ).toEqual([]);
  });
});
