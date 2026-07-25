/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

afterEach(cleanup);

function button() {
  return screen.getByRole("button") as HTMLButtonElement;
}

describe("Button", () => {
  it("stays disabled while loading even when disabled={false} is passed", () => {
    // Regression: props were spread after the computed disabled attribute, so
    // an explicit disabled prop clobbered the loading guard and left the
    // button clickable during an in-flight action (double-submit).
    render(
      <Button loading disabled={false}>
        Save
      </Button>,
    );
    expect(button().disabled).toBe(true);
  });

  it("respects an explicit disabled prop when not loading", () => {
    render(<Button disabled>Save</Button>);
    expect(button().disabled).toBe(true);
  });

  it("is enabled when neither loading nor disabled", () => {
    render(<Button>Save</Button>);
    expect(button().disabled).toBe(false);
  });
});
