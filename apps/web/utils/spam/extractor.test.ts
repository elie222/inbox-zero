import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractPdf, segmentText } from "./extractor";
import { runIsolatedExtractor } from "./isolated-process";

vi.mock("./isolated-process", () => ({ runIsolatedExtractor: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe("extraction result boundary", () => {
  it("rejects incomplete successful PDF responses", async () => {
    vi.mocked(runIsolatedExtractor).mockResolvedValue({
      version: 1,
      backend: "apple-1",
      osVersion: "test",
      valid: true,
      pageCount: 2,
      pages: ["one"],
      attributes: [],
      thumbnails: [],
    });
    await expect(extractPdf(Buffer.from("pdf"))).rejects.toThrow(
      "Incomplete PDF",
    );
  });
  it("propagates worker failure instead of marking content clean", async () => {
    vi.mocked(runIsolatedExtractor).mockRejectedValue(
      new Error("worker timeout"),
    );
    await expect(extractPdf(Buffer.from("pdf"))).rejects.toThrow(
      "worker timeout",
    );
  });
  it("does not send oversized data to a worker", async () => {
    await expect(
      extractPdf(Buffer.alloc(25 * 1024 * 1024 + 1)),
    ).rejects.toThrow("byte limit");
    expect(runIsolatedExtractor).not.toHaveBeenCalled();
  });
  it("preserves leading BOMs in the language request", async () => {
    const input = "\uFEFF\uFEFF日本語";
    vi.mocked(runIsolatedExtractor).mockResolvedValue({
      version: 1,
      backend: "apple-1",
      osVersion: "test",
      segments: [{ tokens: [input] }],
    });
    expect((await segmentText([input])).get(input)).toEqual([input]);
    const request = vi.mocked(runIsolatedExtractor).mock.calls[0][2] as {
      texts: string[];
    };
    expect(Buffer.from(request.texts[0], "base64").toString()).toBe(input);
  });
  it("rejects truncated language responses without falling back silently", async () => {
    vi.mocked(runIsolatedExtractor).mockResolvedValue({
      version: 1,
      backend: "apple-1",
      osVersion: "test",
      segments: [],
    });
    await expect(segmentText(["日本語"])).rejects.toThrow();
  });
});
