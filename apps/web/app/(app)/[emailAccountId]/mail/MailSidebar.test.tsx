/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TagIcon } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailSidebar, type MailSidebarProps } from "./MailSidebar";

(globalThis as { React?: typeof React }).React = React;

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => null,
}));

afterEach(cleanup);

function sidebar(overrides: Partial<MailSidebarProps> = {}) {
  return (
    <MailSidebar
      activeType="inbox"
      activeLabelId={null}
      activeFolderId={null}
      hrefFor={(target) =>
        target.kind === "type" ? `/mail?type=${target.type}` : "/mail"
      }
      labels={[]}
      folders={[]}
      countsById={new Map()}
      categories={[]}
      categoryHeading="Categories"
      labelsHeading="Labels"
      labelSingular="label"
      backToAppHref="/automation"
      onCompose={vi.fn()}
      onCreateLabel={vi.fn()}
      onEditMailboxItem={vi.fn()}
      onDeleteMailboxItem={vi.fn()}
      labelEditMode="name-and-color"
      labelColorOptions={[]}
      {...overrides}
    />
  );
}

function renderSidebar(overrides: Partial<MailSidebarProps> = {}) {
  return render(sidebar(overrides));
}

describe("MailSidebar", () => {
  it("leaves the inbox out in the open and everything else behind Mail", () => {
    renderSidebar();

    expect(screen.getByText("Inbox").closest("a")?.getAttribute("href")).toBe(
      "/mail?type=inbox",
    );
    expect(screen.queryByText("Sent")).toBeNull();

    fireEvent.click(screen.getByText("Mail"));

    expect(
      [
        "Drafts",
        "Sent",
        "Archived",
        "Starred",
        "Scheduled",
        "Spam",
        "Trash",
      ].map((name) =>
        screen.getByText(name).closest("a")?.getAttribute("href"),
      ),
    ).toEqual([
      "/mail?type=draft",
      "/mail?type=sent",
      "/mail?type=archive",
      "/mail?type=starred",
      "/mail?type=scheduled",
      "/mail?type=spam",
      "/mail?type=trash",
    ]);
  });

  it("opens the Mail group when one of its views is showing", () => {
    renderSidebar({ activeType: "trash" });

    expect(
      screen.getByText("Trash").closest("a")?.getAttribute("aria-current"),
    ).toBe("page");
  });

  it("keeps the active view reachable in the icon rail", () => {
    renderSidebar({ activeType: "trash", collapsed: true });

    expect(screen.getByText("Trash").closest("a")?.getAttribute("href")).toBe(
      "/mail?type=trash",
    );
  });

  it("leaves the Mail group out of the icon rail for other views", () => {
    // Nothing in the rail can toggle the group, so a row only earns its space
    // there while its own view is open.
    renderSidebar({ activeType: "inbox", collapsed: true });

    expect(screen.queryByText("Trash")).toBeNull();
  });

  it("closes the Mail group in the rail once its view is left behind", () => {
    const { rerender } = renderSidebar({
      activeType: "trash",
      collapsed: true,
    });

    expect(screen.getByText("Trash")).toBeDefined();

    // The rail offers no way back out, so the group cannot outlive its view.
    rerender(sidebar({ activeType: "inbox", collapsed: true }));

    expect(screen.queryByText("Trash")).toBeNull();
  });

  it("keeps a chosen Mail group open across navigation when expanded", () => {
    const { rerender } = renderSidebar({ activeType: "trash" });

    rerender(sidebar({ activeType: "inbox" }));

    expect(screen.getByText("Trash")).toBeDefined();
  });

  it("closes the Categories group in the rail once its view is left behind", () => {
    const categories = [
      { name: "Promotions", type: "CATEGORY_PROMOTIONS", Icon: TagIcon },
    ];
    const { rerender } = renderSidebar({
      activeType: "CATEGORY_PROMOTIONS",
      categories,
      collapsibleCategories: true,
      collapsed: true,
    });

    expect(screen.getByText("Promotions")).toBeDefined();

    rerender(
      sidebar({
        activeType: "inbox",
        categories,
        collapsibleCategories: true,
        collapsed: true,
      }),
    );

    expect(screen.queryByText("Promotions")).toBeNull();
  });

  it("leaves the extra views out of the combined inbox", () => {
    renderSidebar({ unified: true });

    expect(screen.queryByText("Mail")).toBeNull();
    expect(screen.getByText("All inboxes")).toBeDefined();
  });
});
