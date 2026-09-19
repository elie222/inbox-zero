import { fetchAttachment } from "./download";
import { beforeEach, expect, it, vi } from "vitest";
import { createOpenedConversationAttachments } from "./opened-conversation";

vi.mock("./download", () => ({
  fetchAttachment: vi.fn(),
  getAttachmentUrl: () => "/attachment",
}));

vi.mock("./download-queue", () => ({
  queueAttachmentDownload: async ({
    download,
    signal,
  }: {
    download: (signal: AbortSignal) => Promise<unknown>;
    signal?: AbortSignal;
  }) => download(signal ?? new AbortController().signal),
}));

const MiB = 1024 * 1024;
const image = {
  filename: "image.png",
  mimeType: "image/png",
  size: MiB,
  attachmentId: "file",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.mocked(fetchAttachment).mockResolvedValue(rasterBlob());
});

it("shares a three MiB allowance across messages", async () => {
  const session = createOpenedConversationAttachments(
    "account",
    "thread",
    true,
  );
  const results = await Promise.all(
    ["a", "b", "c", "d"].map((id) =>
      session.load(id, "file", undefined, image),
    ),
  );
  expect(results.filter(Boolean)).toHaveLength(3);
  expect(fetchAttachment).toHaveBeenCalledTimes(3);
});

it("does not fetch when the tab is hidden or offline", async () => {
  vi.stubGlobal("document", { visibilityState: "hidden" });
  const session = createOpenedConversationAttachments(
    "account",
    "thread",
    true,
  );
  expect(await session.load("a", "file", undefined, image)).toBeUndefined();
  expect(fetchAttachment).not.toHaveBeenCalled();
});

it("fetches previewable images when the descriptor omits size", async () => {
  const session = createOpenedConversationAttachments(
    "account",
    "thread",
    true,
  );
  expect(
    await session.load("a", "file", undefined, { ...image, size: 0 }),
  ).toBeInstanceOf(Blob);
  expect(fetchAttachment).toHaveBeenCalledTimes(1);
});

it("does not expose MIME-spoofed documents as image previews", async () => {
  vi.mocked(fetchAttachment).mockResolvedValue(
    new Blob(
      [
        '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="changed"</script></svg>',
      ],
      { type: "image/png" },
    ),
  );
  const session = createOpenedConversationAttachments(
    "account",
    "thread",
    true,
  );
  expect(await session.load("a", "file", undefined, image)).toBeUndefined();
});

function rasterBlob() {
  return new Blob([
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
      "base64",
    ),
  ]);
}
