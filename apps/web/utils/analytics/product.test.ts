import { describe, expect, it } from "vitest";
import { getPageViewSearch } from "@/utils/analytics/product";

describe("getPageViewSearch", () => {
  it("drops thread selection and search text but keeps the view", () => {
    expect(
      getPageViewSearch(
        new URLSearchParams(
          "type=inbox&thread-id=t1&thread-account-id=a1&side-panel-thread-id=t2&q=invoice&split=s1",
        ),
      ),
    ).toBe("type=inbox&split=s1");
  });

  it("is unchanged when only the open thread changes", () => {
    expect(
      getPageViewSearch(new URLSearchParams("type=inbox&thread-id=t1")),
    ).toBe(getPageViewSearch(new URLSearchParams("type=inbox&thread-id=t2")));
  });

  it("handles missing params", () => {
    expect(getPageViewSearch(null)).toBe("");
    expect(getPageViewSearch(new URLSearchParams("thread-id=t1"))).toBe("");
  });
});
