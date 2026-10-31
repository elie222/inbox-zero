// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { isSafeToReload } from "@/utils/safe-reload";
import { ComposeEmailFormLazy } from "./ComposeEmailFormLazy";

vi.mock("next/dynamic", () => ({ default: () => () => <div>Loading</div> }));

it("blocks reload as soon as a composer opens, including while its code loads", () => {
  const view = render(<ComposeEmailFormLazy />);
  expect(isSafeToReload()).toBe(false);
  view.unmount();
  expect(isSafeToReload()).toBe(true);
});
