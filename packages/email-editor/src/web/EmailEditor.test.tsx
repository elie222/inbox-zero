// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { EmailEditor, type EmailEditorHandle } from "./EmailEditor";

afterEach(cleanup);

describe("Tiptap email editor", () => {
  it("keeps the rich profile and adds links through the shared link panel", async () => {
    const ref = createRef<EmailEditorHandle>();
    render(<EmailEditor initialHtml="<p>Read the docs</p>" ref={ref} />);
    const textbox = await screen.findByRole("textbox", {
      name: "Email message",
    });

    expect(ref.current?.getValue()).toMatchObject({
      editableHtml: "<p>Read the docs</p>",
      mode: "rich",
    });

    act(() => {
      fireEvent.keyDown(textbox, { key: "k", ctrlKey: true });
    });
    fireEvent.change(screen.getByLabelText("Link address"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.queryByRole("dialog", { name: "Add link" })).toBeNull();
    expect(ref.current?.getValue().editableHtml).toContain(
      'href="https://example.com"',
    );
    expect(ref.current?.replaceSlashTrigger("<b>x</b>")).toBe(false);
  });
});
