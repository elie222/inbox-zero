// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarCardStack } from "./SidebarCardStack";

const cards = [
  { id: "billing", content: <p>Billing</p>, collapsedContent: <p>B</p> },
  { id: "signatures", content: <p>Signatures</p> },
  { id: "update", content: <p>Update</p> },
];

describe("SidebarCardStack", () => {
  afterEach(cleanup);

  it("shows only the first card until the stack is hovered", () => {
    render(<SidebarCardStack cards={cards} collapsed={false} />);
    expect(screen.getByText("Billing")).toBeTruthy();
    expect(screen.queryByText("Signatures")).toBeNull();

    fireEvent.mouseEnter(screen.getByRole("region", { name: "Notices" }));
    expect(screen.getByText("Signatures")).toBeTruthy();
    expect(screen.getByText("Update")).toBeTruthy();
  });

  it("shows the first card's icon with a count when the sidebar is collapsed", () => {
    render(<SidebarCardStack cards={cards} collapsed />);
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("renders nothing without cards", () => {
    const { container } = render(
      <SidebarCardStack cards={[]} collapsed={false} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
