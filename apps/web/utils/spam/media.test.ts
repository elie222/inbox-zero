import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectPdf, extractSpamFeatures } from "./media";
import { SpamTokenizer } from "./tokenizer";
import { extractPdf } from "./extractor";
import { getMockMessage } from "@/__tests__/helpers";

vi.mock("./extractor", () => ({ extractPdf: vi.fn() }));
vi.mock("./native-tokenizer", () => ({
  tokenizeWithLanguage: async (collect: (tokens: SpamTokenizer) => void) => {
    const tokens = new SpamTokenizer();
    collect(tokens);
    return tokens;
  },
}));
beforeEach(() => vi.clearAllMocks());
describe("PDF features and limits", () => {
  it("retains the no-text signal for a locked or image-only PDF", async () => {
    vi.mocked(extractPdf).mockResolvedValue({
      version: 1,
      backend: "apple-1",
      osVersion: "test",
      valid: true,
      pageCount: 4,
      pages: ["", "", "", ""],
      attributes: [],
      thumbnails: [],
    });
    const tokens = new SpamTokenizer();
    await collectPdf(Buffer.from("locked"), tokens);
    expect(Object.fromEntries(tokens.tokens)).toEqual({
      "^ippc-4": 1,
      "^ippc-l": 1,
      "P:^notext": 1,
    });
  });
  it("uses received bytes, even when attachment metadata understates its size", async () => {
    const message = {
      ...getMockMessage(),
      inline: [],
      attachments: [
        {
          filename: "large.pdf",
          size: 1,
          mimeType: "application/pdf",
          attachmentId: "file",
          headers: {
            "content-description": "",
            "content-id": "",
            "content-transfer-encoding": "base64",
            "content-type": "application/pdf",
          },
        },
      ],
    };
    const provider = {
      getAttachment: vi.fn().mockResolvedValue({
        data: Buffer.alloc(25 * 1024 * 1024 + 1).toString("base64"),
      }),
    };
    await expect(
      extractSpamFeatures(message, provider as never),
    ).rejects.toThrow("inspection limit");
    expect(extractPdf).not.toHaveBeenCalled();
  });
});
