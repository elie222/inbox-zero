import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueAttachmentDownload } from "./download-queue";

beforeEach(() => {
  vi.stubGlobal("navigator", {
    locks: {
      request: vi.fn(async (_name, options, operation) => {
        options.signal.throwIfAborted();
        return operation();
      }),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("attachment transfer scheduling", () => {
  it("serializes downloads and puts requested work ahead of queued previews", async () => {
    const order: string[] = [];
    let release: (() => void) | undefined;
    const first = queueAttachmentDownload({
      priority: "speculative",
      download: async () => {
        order.push("active");
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    await Promise.resolve();
    const preview = queueAttachmentDownload({
      priority: "speculative",
      download: async () => {
        order.push("preview");
      },
    });
    const requested = queueAttachmentDownload({
      priority: "requested",
      download: async () => {
        order.push("requested");
      },
    });
    expect(order).toEqual(["active"]);
    release?.();
    await Promise.all([first, preview, requested]);
    expect(order).toEqual(["active", "requested", "preview"]);
  });

  it("removes a cancelled queued preview without downloading it", async () => {
    const controller = new AbortController();
    const download = vi.fn();
    const task = queueAttachmentDownload({
      priority: "speculative",
      signal: controller.signal,
      download,
    });
    const rejected = expect(task).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(download).not.toHaveBeenCalled();
  });

  it("does not start a transfer until the device lock is acquired", async () => {
    let acquire: (() => void) | undefined;
    vi.mocked(navigator.locks.request).mockImplementationOnce(
      async (_name, _options, callback) => {
        await new Promise<void>((resolve) => {
          acquire = resolve;
        });
        return callback!(null as never);
      },
    );
    const download = vi.fn(async () => "complete");
    const task = queueAttachmentDownload({ priority: "requested", download });
    await Promise.resolve();
    expect(download).not.toHaveBeenCalled();
    acquire?.();
    await expect(task).resolves.toBe("complete");
  });

  it("rejects a cancelled active transfer and continues queued work", async () => {
    const controller = new AbortController();
    const first = queueAttachmentDownload({
      priority: "requested",
      signal: controller.signal,
      download: (signal) =>
        new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        ),
    });
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await Promise.resolve();
    const second = queueAttachmentDownload({
      priority: "requested",
      download: async () => "next",
    });
    controller.abort();
    await rejected;
    await expect(second).resolves.toBe("next");
  });

  it("rejects an already cancelled request before joining the queue", async () => {
    const controller = new AbortController();
    controller.abort();
    const download = vi.fn();
    await expect(
      queueAttachmentDownload({
        priority: "requested",
        signal: controller.signal,
        download,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(navigator.locks.request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("releases the queue after a failed transfer", async () => {
    const first = queueAttachmentDownload({
      priority: "requested",
      download: async () => {
        throw new Error("transfer failed");
      },
    });
    const rejected = expect(first).rejects.toThrow("transfer failed");
    const second = queueAttachmentDownload({
      priority: "speculative",
      download: async () => "complete",
    });
    await rejected;
    await expect(second).resolves.toBe("complete");
  });

  it("does not silently run uncoordinated transfers when locks are unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const download = vi.fn();
    await expect(
      queueAttachmentDownload({ priority: "speculative", download }),
    ).rejects.toThrow("coordination unavailable");
    expect(download).not.toHaveBeenCalled();
  });
});
