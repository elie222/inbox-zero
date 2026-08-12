import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { activateLemonLicenseKey } from "./index";

const mocks = vi.hoisted(() => ({
  activateLicense: vi.fn(),
}));

vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  activateLicense: mocks.activateLicense,
  getCustomer: vi.fn(),
  lemonSqueezySetup: vi.fn(),
  updateSubscriptionItem: vi.fn(),
}));

describe("activateLemonLicenseKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.activateLicense.mockResolvedValue({
      statusCode: 200,
      error: null,
      data: null,
    });
  });

  it("does not write the license key to logs", async () => {
    const licenseKey = "secret-license-key";
    const logger = createTestLogger();
    const infoSpy = vi.spyOn(logger, "info");
    const errorSpy = vi.spyOn(logger, "error");
    const warnSpy = vi.spyOn(logger, "warn");
    const traceSpy = vi.spyOn(logger, "trace");

    await activateLemonLicenseKey(licenseKey, "License for user-1", logger);

    expect(infoSpy).toHaveBeenCalledExactlyOnceWith("Activating license key");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(traceSpy).not.toHaveBeenCalled();
    expect(mocks.activateLicense).toHaveBeenCalledWith(
      licenseKey,
      "License for user-1",
    );
  });
});
