import { describe, expect, it } from "vitest";
import { getRetryAfterHeaderFromError } from "./get-retry-after-header";

describe("getRetryAfterHeaderFromError", () => {
  it("reads lowercase retry-after header", () => {
    const header = getRetryAfterHeaderFromError({
      response: {
        headers: {
          "retry-after": "30",
        },
      },
    });

    expect(header).toBe("30");
  });

  it("reads Retry-After header regardless of case", () => {
    const header = getRetryAfterHeaderFromError({
      response: {
        headers: {
          "Retry-After": "45",
        },
      },
    });

    expect(header).toBe("45");
  });

  it("reads retry-after header from nested cause responses", () => {
    const header = getRetryAfterHeaderFromError({
      cause: {
        response: {
          headers: {
            "Retry-After": "120",
          },
        },
      },
    });

    expect(header).toBe("120");
  });
});
