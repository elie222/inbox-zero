/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SentMessageOpenStatus } from "@/components/email-list/SentMessageOpenStatus";

describe("SentMessageOpenStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-11T14:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("describes an unopened message", () => {
    render(
      <SentMessageOpenStatus
        open={{ firstOpenedAt: null, lastOpenedAt: null, openCount: 0 }}
      />,
    );
    expect(screen.getByText("Not opened yet")).toBeTruthy();
  });

  it("describes a single open", () => {
    render(
      <SentMessageOpenStatus
        open={{
          firstOpenedAt: "2026-09-11T12:00:00.000Z",
          lastOpenedAt: "2026-09-11T12:00:00.000Z",
          openCount: 1,
        }}
      />,
    );
    expect(screen.getByText("Opened about 2 hours ago")).toBeTruthy();
  });

  it("describes repeated opens", () => {
    render(
      <SentMessageOpenStatus
        open={{
          firstOpenedAt: "2026-09-11T10:00:00.000Z",
          lastOpenedAt: "2026-09-11T12:00:00.000Z",
          openCount: 3,
        }}
      />,
    );
    expect(
      screen.getByText("Opened 3 times · Last opened about 2 hours ago"),
    ).toBeTruthy();
  });
});
