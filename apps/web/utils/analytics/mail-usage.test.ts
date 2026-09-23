/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackMailAction } from "@/utils/analytics/mail-usage";

const capture = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { capture } }));

describe("trackMailAction", () => {
  beforeEach(() => {
    capture.mockClear();
  });

  it("sends list navigation as one summary when the page is hidden", () => {
    trackMailAction({ action: "next", source: "shortcut", shortcut: "j" });
    trackMailAction({ action: "next", source: "shortcut", shortcut: "j" });
    trackMailAction({ action: "previous", source: "shortcut", shortcut: "k" });
    expect(capture).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pagehide"));

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      "mail_navigation_summary",
      { next_count: 2, previous_count: 1, total_count: 3 },
      { transport: "sendBeacon" },
    );
  });

  it("sends other actions as individual events", async () => {
    trackMailAction({ action: "archive", source: "shortcut", shortcut: "e" });
    trackMailAction({ action: "mail-archive", source: "palette" });

    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(capture).toHaveBeenCalledWith("mail_action", {
      action: "archive",
      source: "shortcut",
      shortcut: "e",
    });
    expect(capture).toHaveBeenCalledWith("mail_action", {
      action: "mail-archive",
      source: "palette",
    });
  });
});
