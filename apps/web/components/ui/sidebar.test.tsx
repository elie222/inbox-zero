// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, useSidebar } from "./sidebar";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

afterEach(cleanup);

describe("SidebarProvider", () => {
  it("toggles only the assigned sidebar across repeated shortcuts", () => {
    render(
      <SidebarProvider
        defaultOpen="all"
        sidebarNames={["left-sidebar", "chat-sidebar"]}
        keyboardShortcutName="left-sidebar"
      >
        <SidebarState />
      </SidebarProvider>,
    );

    fireEvent.keyDown(window, { key: "b", metaKey: true });

    expect(screen.getByRole("status").textContent).toBe("chat-sidebar");

    fireEvent.keyDown(window, { key: "b", metaKey: true });

    expect(screen.getByRole("status").textContent).toBe(
      "chat-sidebar,left-sidebar",
    );
  });
});

function SidebarState() {
  const { state } = useSidebar();

  return <output>{state.join(",")}</output>;
}
