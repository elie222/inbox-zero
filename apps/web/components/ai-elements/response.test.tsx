/** @vitest-environment jsdom */

import React, { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Response } from "@/components/ai-elements/response";

(globalThis as { React?: typeof React }).React = React;

afterEach(() => {
  cleanup();
});

describe("Response", () => {
  it("renders markdown content", () => {
    render(
      createElement(Response, null, "Please review the **weekly update**."),
    );

    expect(screen.getByText(/Please review the/i)).toBeTruthy();
    expect(screen.getByText("weekly update")).toBeTruthy();
  });
});
