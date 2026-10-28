// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentComposer } from "./CommentComposer";

afterEach(cleanup);

describe("CommentComposer", () => {
  it("does not reuse a removed pick when an ambiguous name is retyped", () => {
    const onSubmit = vi.fn().mockResolvedValue({ data: {} });
    render(
      <CommentComposer
        candidates={[
          { memberId: "jane-1", name: "Jane" },
          { memberId: "jane-2", name: "Jane" },
        ]}
        participantIds={[]}
        onSubmit={onSubmit}
      />,
    );
    const composer = screen.getByRole("combobox");

    fireEvent.change(composer, { target: { value: "@Ja" } });
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(screen.getByText(/also share/)).toBeTruthy();

    fireEvent.change(composer, { target: { value: "" } });
    fireEvent.change(composer, { target: { value: "@Jane hi" } });

    expect(screen.queryByText(/also share/)).toBeNull();
    fireEvent.keyDown(composer, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedMemberIds: [] }),
    );
  });
});
