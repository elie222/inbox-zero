// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SenderIcon } from "./SenderIcon";

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

describe("SenderIcon", () => {
  it("shows a person's initials instead of their mail provider's logo", () => {
    const { container } = render(
      <SenderIcon email="jane.doe@gmail.com" name="Jane Doe" />,
    );

    expect(screen.getByText("JD")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the company logo for senders on a company domain", () => {
    const { container } = render(
      <SenderIcon email="news@example.com" name="Example News" />,
    );

    expect(screen.queryByText("EN")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "example.com",
    );
  });
});
