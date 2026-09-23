import { describe, expect, it } from "vitest";
import {
  getPageViewSearch,
  stripUntrackedUrlParams,
} from "@/utils/analytics/product";

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

describe("stripUntrackedUrlParams", () => {
  it("removes thread ids and search text from every URL PostHog attaches", () => {
    const event = stripUntrackedUrlParams({
      properties: {
        $current_url:
          "https://app.test/acc/mail?split=news&thread-id=t1&q=invoice",
        $referrer: "https://app.test/acc/mail?side-panel-thread-id=t2",
        event_name: "kept",
      },
      $set_once: {
        $initial_current_url: "https://app.test/acc/mail?q=refund",
      },
    });
    expect(event.properties).toEqual({
      $current_url: "https://app.test/acc/mail?split=news",
      $referrer: "https://app.test/acc/mail",
      event_name: "kept",
    });
    expect(event.$set_once).toEqual({
      $initial_current_url: "https://app.test/acc/mail",
    });
  });
});
