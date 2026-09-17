/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function renderSidebar(overrides: Partial<MailSidebarProps> = {}) {
  return render(
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
    />,
  );
}

describe("MailSidebar", () => {
  it("keeps the extra views behind the More group until it is opened", () => {
    renderSidebar();

    expect(screen.queryByText("Scheduled")).toBeNull();

    fireEvent.click(screen.getByText("More"));

    expect(
      ["Starred", "Scheduled", "Spam", "Trash"].map((name) =>
        screen.getByText(name).closest("a")?.getAttribute("href"),
      ),
    ).toEqual([
      "/mail?type=starred",
      "/mail?type=scheduled",
      "/mail?type=spam",
      "/mail?type=trash",
    ]);
  });

  it("opens the More group when one of its views is showing", () => {
    renderSidebar({ activeType: "trash" });

    expect(
      screen.getByText("Trash").closest("a")?.getAttribute("aria-current"),
    ).toBe("page");
  });

  it("leaves the extra views out of the combined inbox", () => {
    renderSidebar({ unified: true });

    expect(screen.queryByText("More")).toBeNull();
  });
});
