/** @vitest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailboxThreadList } from "./MailboxSurface";

(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Item = { id: string };

describe("MailboxThreadList focus restoration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("restores DOM focus to the matching row on mount and notifies completion", () => {
    const onFocusRestored = vi.fn();

    renderList(root, {
      items: [{ id: "thread-1" }, { id: "thread-2" }],
      focusedIndex: 1,
      restoreFocusKey: "thread-2",
      onFocusRestored,
    });

    const targetRow = container.querySelector<HTMLElement>(
      '[data-row-id="thread-2"]',
    );
    expect(targetRow).not.toBeNull();
    expect(document.activeElement).toBe(targetRow);
    expect(onFocusRestored).toHaveBeenCalledTimes(1);
  });

  it("falls back to focusing the listbox when the restored row is gone but other rows remain", () => {
    const onFocusRestored = vi.fn();

    renderList(root, {
      items: [{ id: "thread-1" }],
      focusedIndex: 0,
      restoreFocusKey: "thread-2",
      onFocusRestored,
    });

    const listbox = container.querySelector<HTMLElement>('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(document.activeElement).toBe(listbox);
    expect(onFocusRestored).toHaveBeenCalledTimes(1);
  });

  it("falls back to focusing the list container when the list is empty", () => {
    const onFocusRestored = vi.fn();

    renderList(root, {
      items: [],
      focusedIndex: 0,
      restoreFocusKey: "thread-1",
      onFocusRestored,
    });

    expect(document.activeElement).not.toBe(document.body);
    expect(container.contains(document.activeElement)).toBe(true);
    expect(onFocusRestored).toHaveBeenCalledTimes(1);
  });
});

function renderList(
  root: Root,
  props: {
    items: Item[];
    focusedIndex: number;
    restoreFocusKey?: string | null;
    onFocusRestored?: () => void;
  },
) {
  act(() => {
    root.render(
      <MailboxThreadList
        focusedIndex={props.focusedIndex}
        getKey={(item) => item.id}
        isLoadingMore={false}
        isSelected={() => false}
        items={props.items}
        listKey="inbox"
        onFocusRestored={props.onFocusRestored}
        onLoadMore={() => {}}
        onOpen={() => {}}
        onSelectRangeTo={() => {}}
        onToggleSelect={() => {}}
        renderItem={(row) => (
          <div
            aria-selected={row.isSelected}
            data-row-id={row.rowKey}
            key={row.rowKey}
            ref={row.rowRef}
            role="option"
            tabIndex={row.isFocused ? 0 : -1}
          >
            {row.item.id}
          </div>
        )}
        restoreFocusKey={props.restoreFocusKey}
        selectedCount={0}
        showLoadMore={false}
      />,
    );
  });
}
