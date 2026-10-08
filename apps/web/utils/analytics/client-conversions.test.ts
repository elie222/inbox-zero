// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendGTMEvent } from "@next/third-parties/google";
import { setCookieConsent } from "@/utils/cookie-consent";
import { trackClientConversion } from "./client-conversions";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_GTM_ID: "GTM-TEST" },
}));
vi.mock("@next/third-parties/google", () => ({
  sendGTMEvent: vi.fn(),
}));

describe("trackClientConversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("sends conversions right away where consent is not required", () => {
    useTimeZone("America/Chicago");

    trackClientConversion({ name: "registration_completed" });

    expect(sendGTMEvent).toHaveBeenCalledWith({
      event: "CompleteRegistration",
    });
  });

  it("holds a conversion until the visitor accepts", () => {
    useTimeZone("Europe/Berlin");

    trackClientConversion({ name: "registration_completed" });
    expect(sendGTMEvent).not.toHaveBeenCalled();

    setCookieConsent("granted");

    expect(sendGTMEvent).toHaveBeenCalledTimes(1);
  });

  it("drops a held conversion when the visitor rejects", () => {
    useTimeZone("Europe/Berlin");

    trackClientConversion({ name: "registration_completed" });
    setCookieConsent("denied");

    expect(sendGTMEvent).not.toHaveBeenCalled();
  });
});

function useTimeZone(timeZone: string) {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...new Intl.DateTimeFormat().resolvedOptions(),
    timeZone,
  });
}
